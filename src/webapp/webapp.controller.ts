import { Controller, Get, Post, Body, Query, Headers, Res, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenBudgetService } from '../openbudget/openbudget.service';
import { WalletService } from '../wallet/wallet.service';
import { ProxyManagerService } from '../proxy/proxy-manager.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const curlLogger = new Logger('OpenBudgetVoteProxy');

/**
 * OpenBudget bilan curl orqali muloqot qilishda vaqti-vaqti bilan (proxy uzilishi,
 * tarmoq tiqilishi) yuz beradigan vaqtinchalik xatolarda avtomatik qayta urinish.
 * Har bir urinish va yakuniy natija log qilinadi — muammo yuz bersa, aynan qaysi
 * so'rov, necha marta urinilgani va nima sabab bilan barbod bo'lgani ko'rinadi.
 */
async function execCurlWithRetry(args: string[], maxRetries = 2, label = 'curl'): Promise<{ stdout: string }> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await execFileAsync('curl', args, { maxBuffer: 10 * 1024 * 1024 });
      if (attempt > 1) {
        curlLogger.log(`✅ [${label}] ${attempt}-urinishda muvaffaqiyatli o'tdi.`);
      }
      return result;
    } catch (e: any) {
      lastErr = e;
      curlLogger.warn(`⚠️ [${label}] ${attempt}/${maxRetries}-urinish xato: ${e.message}`);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }
  curlLogger.error(`❌ [${label}] Barcha ${maxRetries} urinish barbod bo'ldi: ${lastErr?.message}`);
  throw lastErr;
}

@Controller()
export class WebAppController {
  private readonly logger = new Logger(WebAppController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openBudgetService: OpenBudgetService,
    private readonly walletService: WalletService,
    private readonly proxyManager: ProxyManagerService,
    private readonly configService: ConfigService,
  ) {}

  @Get('user')
  async getUserProfile(@Query('telegramId') telegramId: string) {
    if (!telegramId) throw new BadRequestException('telegramId talab qilinadi');

    const user = await this.prisma.user.findUnique({
      where: { telegramId },
      include: {
        referrals: { select: { id: true, firstName: true, createdAt: true, totalVotes: true } },
        votes: { orderBy: { createdAt: 'desc' }, take: 10 },
        withdrawals: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    if (!user) throw new BadRequestException('Foydalanuvchi topilmadi');

    const voteReward = this.configService.get<number>('bot.voteReward') || 200000;
    const refBonus = this.configService.get<number>('bot.referralBonus') || 1000;
    const minWithdrawal = this.configService.get<number>('bot.minWithdrawal') || 10000;

    return {
      user,
      config: {
        voteReward,
        refBonus,
        minWithdrawal,
        botUsername: this.configService.get<string>('bot.username'),
      },
    };
  }

  @Get('leaderboard')
  async getLeaderboard() {
    const topReferrers = await this.prisma.user.findMany({
      orderBy: { totalEarned: 'desc' },
      take: 10,
      select: {
        id: true,
        firstName: true,
        username: true,
        totalEarned: true,
        totalVotes: true,
        _count: { select: { referrals: true } },
      },
    });

    return topReferrers;
  }

  @Get('initiative')
  async getInitiative() {
    return this.openBudgetService.getDefaultInitiative();
  }

  @Post('request-sms')
  async requestSms(@Body() body: { phone: string; initiativeId?: number }) {
    if (!body.phone) throw new BadRequestException('Telefon raqam talab qilinadi');
    return this.openBudgetService.requestSmsForVote(body.phone, body.initiativeId);
  }

  @Post('verify-sms')
  async verifySms(@Body() body: { telegramId: string; phone: string; smsCode: string; sessionId?: string }) {
    if (!body.telegramId || !body.phone || !body.smsCode) {
      throw new BadRequestException('Ma\'lumotlar to\'liq emas');
    }

    const user = await this.prisma.user.findUnique({ where: { telegramId: body.telegramId } });
    if (!user) throw new BadRequestException('Foydalanuvchi topilmadi');

    const res = await this.openBudgetService.verifySmsCode(body.phone, body.smsCode, body.sessionId);
    if (!res.success) return res;

    const voteReward = this.configService.get<number>('bot.voteReward') || 200000;

    // Ovoz saqlash
    await this.prisma.vote.create({
      data: {
        userId: user.id,
        phone: body.phone,
        status: 'VERIFIED',
        rewardAmount: voteReward,
        smsCode: body.smsCode,
        sessionId: body.sessionId,
        completedAt: new Date(),
      },
    });

    const { user: updatedUser, reward, refBonus } = await this.walletService.creditVoteReward(user.id, voteReward);

    return {
      success: true,
      message: 'Ovoz muvaffaqiyatli qabul qilindi!',
      reward,
      newBalance: updatedUser.balance,
    };
  }

  @Post('withdraw')
  async requestWithdrawal(
    @Body()
    body: {
      telegramId: string;
      amount: number;
      paymentMethod: 'UZCARD' | 'HUMO' | 'PAYNET';
      accountDetails: string;
    },
  ) {
    if (!body.telegramId || !body.amount || !body.paymentMethod || !body.accountDetails) {
      throw new BadRequestException('Barcha maydonlarni to\'ldiring');
    }

    const user = await this.prisma.user.findUnique({ where: { telegramId: body.telegramId } });
    if (!user) throw new BadRequestException('Foydalanuvchi topilmadi');

    const res = await this.walletService.createWithdrawalRequest({
      userId: user.id,
      amount: body.amount,
      paymentMethod: body.paymentMethod,
      accountDetails: body.accountDetails,
    });

    return {
      success: true,
      message: 'Pul yechish so\'rovi qabul qilindi!',
      withdrawal: res.withdrawal,
      balance: res.updatedUser.balance,
    };
  }

  /**
   * 🗳 Rasmiy OpenBudget Captcha sahifasini to'g'ridan-to'g'ri ko'rsatish
   */
  @Get(['/captcha', '/api/v2/vote/mvc/captcha', '/api/v2/vote/mvc/captcha/:uuid', '/api/v2/vote/mvc/verify'])
  async getCaptchaPage(
    @Query('initiativeUuid') initiativeUuidQuery?: string,
    @Query('phone') phoneQuery?: string,
    @Query('botId') botIdQuery?: string,
    @Query('tg_id') tgIdQuery?: string,
    @Headers('cookie') clientCookies?: string,
    @Res() res?: any,
  ) {
    const defaultUuid = 'b8752aa2-e6da-470c-8a26-52d5b594526a';
    const initUuid = initiativeUuidQuery || defaultUuid;

    const proxy = this.proxyManager.getNextProxy();
    const args: string[] = ['-s', '-i', '--connect-timeout', '5', '--max-time', '10'];

    if (proxy) {
      const auth = proxy.auth ? `${proxy.auth.username}:${proxy.auth.password}@` : '';
      args.push('-x', `http://${auth}${proxy.host}:${proxy.port}`);
    }

    if (clientCookies) {
      args.push('-H', `Cookie: ${clientCookies}`);
    }
    args.push('-H', 'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    args.push('-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    args.push(`https://new.openbudget.uz/api/v2/vote/mvc/captcha/${initUuid}`);

    try {
      const { stdout } = await execCurlWithRetry(args, 2, 'GET captcha-page');

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // Cookie larni mijozga uzatish
      const cookieMatches = stdout.match(/set-cookie:\s*([^\r\n]+)/gi) || [];
      for (const c of cookieMatches) {
        const val = c.replace(/^set-cookie:\s*/i, '');
        res.setHeader('Set-Cookie', val);
      }

      if (tgIdQuery) {
        res.cookie('VOTE_TG_ID', tgIdQuery, { maxAge: 1800000, httpOnly: false });
      }
      if (botIdQuery) {
        res.cookie('VOTE_BOT_ID', botIdQuery, { maxAge: 1800000, httpOnly: false });
      }

      const htmlStart = stdout.indexOf('<!DOCTYPE html>') !== -1 ? stdout.indexOf('<!DOCTYPE html>') : stdout.indexOf('<html');
      let bodyRaw = htmlStart !== -1 ? stdout.slice(htmlStart) : stdout;

      // 1. Iframe anti-tamper redirectini (eval packerni) butunlay olib tashlash!
      bodyRaw = bodyRaw.replace(/eval\s*\(\s*function\s*\([a-z,\s]+\)[\s\S]*?\.split\(['"][|]['"][\s\S]*?\)\s*\)/gi, '/* iframe blocker removed */');
      bodyRaw = bodyRaw.replace(/window\.location\.href\s*=\s*['"]https:\/\/openbudget\.uz['"]/gi, '/* redirect removed */');

      // 2. OpenBudget ichki form action manzillarini bizning proxy endpointga moslash
      bodyRaw = bodyRaw.replace(/action="\/api\/v2\/vote\/mvc\/captcha"/g, 'action="/api/v2/vote/mvc/captcha"');
      bodyRaw = bodyRaw.replace(/action="\/api\/v2\/vote\/mvc\/verify"/g, 'action="/api/v2/vote/mvc/verify"');

      // 3. Agar telefon raqam yoki telegram ma'lumotlari bo'lsa
      const cleanPhone = phoneQuery ? phoneQuery.replace(/[^0-9]/g, '').slice(-9) : '';
      const formattedPhone = cleanPhone.length === 9 
        ? `${cleanPhone.slice(0,2)} ${cleanPhone.slice(2,5)}-${cleanPhone.slice(5,7)}-${cleanPhone.slice(7,9)}`
        : '';

      if (tgIdQuery || botIdQuery) {
        bodyRaw = bodyRaw.replace(/(<form[^>]*>)/i, `$1<input type="hidden" name="tg_id" value="${tgIdQuery || ''}" /><input type="hidden" name="botId" value="${botIdQuery || ''}" />`);
      }

      const modalDesign = `
      <script src="https://telegram.org/js/telegram-web-app.js"></script>
      <style>
        :root {
          --ob-primary: #079455;
          --ob-primary-hover: #067647;
          --ob-text: #181d27;
          --ob-text-secondary: #414651;
          --ob-text-muted: #717680;
          --ob-border: #d5d7da;
          --ob-surface: #ffffff;
        }

        * {
          box-sizing: border-box !important;
          -webkit-tap-highlight-color: transparent !important;
        }

        html, body {
          background: #f8fafc !important;
          margin: 0 !important;
          padding: 8px 6px !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
          display: flex !important;
          justify-content: center !important;
          align-items: flex-start !important;
          min-height: 100vh !important;
        }

        .container, main, form {
          background: #ffffff !important;
          border-radius: 20px !important;
          padding: 16px 14px !important;
          box-shadow: 0 10px 25px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.03) !important;
          max-width: 390px !important;
          width: 100% !important;
          margin: 0 auto !important;
          border: 1px solid #e2e8f0 !important;
        }

        .header-title {
          font-size: 16px !important;
          font-weight: 700 !important;
          color: #0f172a !important;
          margin-bottom: 12px !important;
          text-align: center !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 6px !important;
        }

        .error-alert, .error {
          background: #fef2f2 !important;
          color: #b91c1c !important;
          border: 1.5px solid #fecaca !important;
          padding: 10px 14px !important;
          border-radius: 12px !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          margin-bottom: 12px !important;
          text-align: center !important;
        }

        .form-item {
          margin-bottom: 16px !important;
          padding: 0 !important;
        }

        .form-item label, .label {
          font-size: 13px !important;
          font-weight: 600 !important;
          color: #475569 !important;
          margin-bottom: 6px !important;
          display: flex !important;
          align-items: center !important;
          gap: 4px !important;
        }

        .form-item-group {
          display: flex !important;
          align-items: center !important;
          background-color: #f1f5f9 !important;
          border: 1.5px solid #e2e8f0 !important;
          border-radius: 14px !important;
          padding: 3px !important;
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04) !important;
        }

        .form-item-group > div:first-child {
          padding: 0 14px !important;
          font-weight: 700 !important;
          color: #0f172a !important;
          font-size: 15px !important;
          background: #ffffff !important;
          height: 42px !important;
          display: flex !important;
          align-items: center !important;
          border-radius: 11px !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06) !important;
        }

        #phone, input[type=tel] {
          height: 42px !important;
          background: transparent !important;
          border: none !important;
          padding: 0 12px !important;
          font-weight: 700 !important;
          text-align: center !important;
          font-size: 17px !important;
          color: #0f172a !important;
          letter-spacing: 1.5px !important;
          width: 100% !important;
          outline: none !important;
        }

        #code {
          height: 52px !important;
          background: #f8fafc !important;
          border: 2px solid #cbd5e1 !important;
          border-radius: 14px !important;
          padding: 0 16px !important;
          font-weight: 800 !important;
          text-align: center !important;
          font-size: 24px !important;
          color: #0f172a !important;
          letter-spacing: 6px !important;
          width: 100% !important;
          outline: none !important;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.03) !important;
          transition: border-color 0.2s !important;
        }

        #code:focus {
          border-color: #079455 !important;
          background: #ffffff !important;
        }

        .img-lazy, #imgLazy {
          position: relative !important;
          width: 345px !important;
          max-width: 100% !important;
          margin: 0 auto !important;
          border: 2px solid #e2e8f0 !important;
          border-radius: 16px !important;
          overflow: hidden !important;
          background: #ffffff !important;
          box-shadow: 0 4px 14px rgba(0,0,0,0.05) !important;
          display: block !important;
          height: auto !important;
          min-height: 120px !important;
        }

        .img-lazy::before {
          display: none !important;
        }

        #imageB {
          display: block !important;
          width: 345px !important;
          max-width: 100% !important;
          height: auto !important;
          cursor: crosshair !important;
          border-radius: 14px !important;
          touch-action: manipulation !important;
        }

        #imgLazy div {
          position: absolute !important;
          background-color: rgba(7, 148, 85, 0.4) !important;
          width: 38px !important;
          height: 38px !important;
          border: 2.5px solid #079455 !important;
          border-radius: 50% !important;
          pointer-events: auto !important;
          cursor: pointer !important;
          z-index: 10 !important;
          box-shadow: 0 0 10px rgba(7, 148, 85, 0.5) !important;
        }

        .refresh-block {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          margin-bottom: 10px !important;
        }

        .refresh-block img {
          border: 1.5px solid #e2e8f0 !important;
          border-radius: 10px !important;
          background: #ffffff !important;
          padding: 3px !important;
          max-height: 44px !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04) !important;
        }

        button[type=submit] {
          height: 50px !important;
          background: #079455 !important;
          color: white !important;
          border-radius: 14px !important;
          font-size: 16px !important;
          font-weight: 700 !important;
          border: none !important;
          width: 100% !important;
          cursor: pointer !important;
          margin-top: 14px !important;
          transition: all 0.2s ease !important;
          box-shadow: 0 4px 14px rgba(7, 148, 85, 0.35) !important;
        }

        button[type=submit]:disabled {
          background: #94a3b8 !important;
          box-shadow: none !important;
          cursor: not-allowed !important;
          opacity: 0.7 !important;
        }

        .timer-container {
          width: 100% !important;
          margin-top: 10px !important;
          margin-bottom: 6px !important;
        }

        .timer-bar-wrap {
          height: 6px !important;
          background: #e2e8f0 !important;
          border-radius: 999px !important;
          overflow: hidden !important;
          position: relative !important;
        }

        .timer-bar-fill {
          height: 100% !important;
          background: linear-gradient(90deg, #079455, #10b981) !important;
          width: 100% !important;
          transition: width 1s linear !important;
          border-radius: 999px !important;
        }

        .timer-label {
          display: flex !important;
          justify-content: space-between !important;
          font-size: 12px !important;
          color: #64748b !important;
          font-weight: 600 !important;
          margin-top: 4px !important;
        }

        .progress, .progress-bar, .progress-bar-timer {
          display: none !important;
        }
      </style>
      <script>
        (function() {
          window.addEventListener('DOMContentLoaded', () => {
            if (window.Telegram && window.Telegram.WebApp) {
              window.Telegram.WebApp.ready();
              window.Telegram.WebApp.expand();
            }

            const domImgLazy = document.getElementById('imgLazy');
            const domImageB = document.getElementById('imageB');
            if (domImgLazy) {
              domImgLazy.classList.add('hide');
            }

            // ⏱ 30-soniyalik silliq zamonaviy taymer
            if (domImgLazy && !document.querySelector('.timer-container')) {
              const timerBox = document.createElement('div');
              timerBox.className = 'timer-container';
              timerBox.innerHTML = \`
                <div class="timer-bar-wrap">
                  <div class="timer-bar-fill" id="timerFill"></div>
                </div>
                <div class="timer-label">
                  <span>Rasm yangilanishi:</span>
                  <span id="timerSec">30 s</span>
                </div>
              \`;
              domImgLazy.parentNode.insertBefore(timerBox, domImgLazy.nextSibling);

              let timeLeft = 30;
              const timerFill = document.getElementById('timerFill');
              const timerSec = document.getElementById('timerSec');

              const countdown = setInterval(() => {
                timeLeft -= 1;
                if (timeLeft <= 0) {
                  clearInterval(countdown);
                  if (timerSec) timerSec.innerText = "Yangilanmoqda...";
                  if (timerFill) timerFill.style.width = "0%";
                  window.location.reload();
                  return;
                }
                if (timerSec) timerSec.innerText = timeLeft + " s";
                if (timerFill) {
                  const pct = (timeLeft / 30) * 100;
                  timerFill.style.width = pct + "%";
                  if (timeLeft <= 5) {
                    timerFill.style.background = "#ef4444";
                  }
                }
              }, 1000);
            }

            // Pre-fill phone if provided
            const phoneInput = document.getElementById('phone');
            const prefilledPhone = "${formattedPhone}";
            if (phoneInput && prefilledPhone) {
              phoneInput.value = prefilledPhone;
              phoneInput.readOnly = true;
              localStorage.setItem('phone', prefilledPhone);
              if (typeof checkPhoneNumber === 'function') checkPhoneNumber(phoneInput);
            }

            // Override click handler with 100% precise scaled coordinates
            if (domImageB && domImgLazy) {
              // Remove old default click handler
              const newImageB = domImageB.cloneNode(true);
              domImageB.parentNode.replaceChild(newImageB, domImageB);

              newImageB.addEventListener('click', (e) => {
                if (typeof xy !== 'undefined' && typeof c !== 'undefined' && xy.length < c) {
                  const rect = newImageB.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const clickY = e.clientY - rect.top;

                  // Scale to intrinsic 345x230 coordinate system
                  const scaleX = 345 / rect.width;
                  const scaleY = 230 / rect.height;

                  const actualX = Math.round(clickX * scaleX);
                  const actualY = Math.round(clickY * scaleY);

                  const pointId = 'pt_' + actualX + '_' + actualY;
                  const existing = xy.find(v => v.id === pointId);

                  if (existing) {
                    xy = xy.filter(v => v.id !== pointId);
                    const el = document.getElementById(pointId);
                    if (el) el.remove();
                  } else {
                    xy.push({
                      id: pointId,
                      x: actualX,
                      y: actualY,
                      renderX: Math.round(clickX),
                      renderY: Math.round(clickY)
                    });
                  }
                  if (typeof set === 'function') set();
                  window.renderPoints();
                }
              });

              window.renderPoints = function() {
                if (typeof xy === 'undefined') return;
                for (const item of xy) {
                  let d = document.getElementById(item.id);
                  if (!d) {
                    d = document.createElement('div');
                    d.id = item.id;
                    d.style.position = 'absolute';
                    d.style.left = item.renderX + 'px';
                    d.style.top = item.renderY + 'px';
                    d.style.transform = 'translate(-50%, -50%)';
                    d.onclick = function(ev) {
                      ev.stopPropagation();
                      xy = xy.filter(v => v.id !== item.id);
                      d.remove();
                      if (typeof set === 'function') set();
                    };
                    domImgLazy.appendChild(d);
                  }
                }
              };
            }

            // Injected header banner
            const form = document.querySelector('form');
            if (form && !document.querySelector('.header-title')) {
              const h = document.createElement('div');
              h.className = 'header-title';
              h.innerHTML = '🗳 <b>Ochiq Budjet | Ovoz berish</b>';
              form.insertBefore(h, form.firstChild);
            }
          });
        })();
      </script>
      `;
      bodyRaw = bodyRaw.replace('</body>', `${modalDesign}</body>`);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(bodyRaw);
    } catch (err: any) {
      this.logger.error(`❌ [GET captcha-page] Xatolik (barcha qayta urinishlardan keyin ham): ${err.message}`);
      return res.status(500).send(`<h3>Captcha yuklashda xatolik: ${err.message}</h3>`);
    }
  }

  /**
   * 📤 Captcha POST so'rovini OpenBudget'ga proxy qilish
   */
  @Post('/api/v2/vote/mvc/captcha')
  async proxyCaptchaPost(
    @Body() body: any,
    @Headers('cookie') clientCookies?: string,
    @Res() res?: any,
  ) {
    const logPhone = String(Array.isArray(body?.phoneNumber) ? (body.phoneNumber[body.phoneNumber.length - 1] || body.phoneNumber[0] || '') : (body?.phoneNumber || '')).replace(/[^0-9]/g, '');
    this.logger.log(`📥 [mvc/captcha POST] So'rov qabul qilindi. Phone: +${logPhone}`);

    const proxy = this.proxyManager.getNextProxy();
    const args: string[] = ['-s', '-i', '--connect-timeout', '5', '--max-time', '12', '-X', 'POST'];

    if (proxy) {
      const auth = proxy.auth ? `${proxy.auth.username}:${proxy.auth.password}@` : '';
      args.push('-x', `http://${auth}${proxy.host}:${proxy.port}`);
    }

    if (clientCookies) {
      args.push('-H', `Cookie: ${clientCookies}`);
    }

    args.push('-H', 'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    args.push('-H', 'Content-Type: application/x-www-form-urlencoded');
    args.push('-H', 'Origin: https://new.openbudget.uz');
    args.push('-H', 'Referer: https://new.openbudget.uz/api/v2/vote/mvc/captcha');

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body || {})) {
      params.append(k, Array.isArray(v) ? String(v[v.length - 1] || v[0] || '') : (typeof v === 'object' ? JSON.stringify(v) : String(v)));
    }
    args.push('--data', params.toString());
    args.push('https://new.openbudget.uz/api/v2/vote/mvc/captcha');

    this.logger.log(`📦 [mvc/captcha POST] So'rov tanasi (request body): ${params.toString()}`);

    try {
      const { stdout } = await execCurlWithRetry(args, 2, `POST mvc/captcha (+${logPhone})`);
      const statusMatch690 = stdout.match(/HTTP\/(?:1\.[01]|2)\s+(\d{3})/g);
      const captchaStatusCode = statusMatch690 ? parseInt(statusMatch690[statusMatch690.length - 1].match(/\d{3}/)![0], 10) : 0;
      this.logger.log(`📤 [mvc/captcha POST] OpenBudget javobi: ${statusMatch690 ? statusMatch690[statusMatch690.length - 1] : "noma'lum"} | Phone: +${logPhone}`);

      // Javob tanasini audit uchun bazaga saqlash (keyinchalik "nima javob keldi?"
      // degan savolga aniq javob berish uchun — konsol loglar deploy paytida yo'qolib
      // qolishi mumkin, lekin bu yozuv bazada qoladi).
      const captchaBodyForLog = stdout.slice(0, 10000);
      this.prisma.openBudgetResponseLog.create({
        data: {
          endpoint: 'CAPTCHA',
          phone: logPhone ? `998${logPhone.replace(/^998/, '')}` : null,
          statusCode: captchaStatusCode,
          requestBody: params.toString(),
          responseBody: captchaBodyForLog,
          isSuccess: captchaStatusCode === 200,
        },
      }).catch(() => {});

      if (captchaStatusCode && captchaStatusCode !== 200) {
        // Captcha bosqichining o'zi rad etilgan (masalan noto'g'ri nuqtalar bosilgan) —
        // bu holatda verify bosqichi baribir HTTP 200 qaytarishi mumkin (OpenBudget
        // ba'zan bo'sh 200 bilan javob beradi), shuning uchun bu yerning o'zida
        // to'xtatamiz va foydalanuvchiga ANIQ xato ko'rsatamiz — "muvaffaqiyat"
        // sahifasiga soxta o'tib ketmasligi uchun.
        this.logger.warn(`⚠️ [mvc/captcha POST] OpenBudget CAPTCHA'ni RAD ETDI: HTTP ${captchaStatusCode} | Phone: +${logPhone}`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(`
          <!DOCTYPE html>
          <html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://telegram.org/js/telegram-web-app.js"></script>
          <style>
            body { font-family: -apple-system, sans-serif; background: #f8fafc; margin: 0; padding: 20px; display: flex; align-items: center; justify-content: center; min-height: 90vh; }
            .card { background: #fff; border-radius: 20px; padding: 26px 20px; text-align: center; max-width: 360px; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
            .icon { width: 68px; height: 68px; background: #fef2f2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 36px; }
            h2 { color: #0f172a; margin: 0 0 8px; font-size: 19px; font-weight: 700; }
            p { color: #475569; font-size: 14px; line-height: 1.5; margin: 0 0 20px; }
            button { width: 100%; height: 50px; background: #dc2626; color: #fff; border: none; border-radius: 12px; font-weight: 700; font-size: 16px; cursor: pointer; }
          </style></head>
          <body>
            <div class="card">
              <div class="icon">⚠️</div>
              <h2>Captcha noto'g'ri!</h2>
              <p>OpenBudget rasmiy tizimi captcha javobini rad etdi (nuqtalar noto'g'ri bosilgan bo'lishi mumkin). Iltimos, botga qaytib, qaytadan urinib ko'ring.</p>
              <button onclick="if(window.Telegram && window.Telegram.WebApp) window.Telegram.WebApp.close(); else window.close();">Botga qaytish</button>
            </div>
            <script>if (window.Telegram && window.Telegram.WebApp) { window.Telegram.WebApp.ready(); window.Telegram.WebApp.expand(); }</script>
          </body></html>
        `);
      }

      const cookieMatches = stdout.match(/set-cookie:\s*([^\r\n]+)/gi) || [];
      for (const c of cookieMatches) {
        const val = c.replace(/^set-cookie:\s*/i, '');
        res.setHeader('Set-Cookie', val);
      }

      const htmlStart = stdout.indexOf('<!DOCTYPE html>') !== -1 ? stdout.indexOf('<!DOCTYPE html>') : stdout.indexOf('<html');
      let bodyRaw = htmlStart !== -1 ? stdout.slice(htmlStart) : stdout;

      const postedPhone = String(Array.isArray(body?.phoneNumber) ? (body.phoneNumber[body.phoneNumber.length - 1] || body.phoneNumber[0] || '') : (body?.phoneNumber || '')).replace(/[^0-9]/g, '');
      const postedTgId = String(body?.tg_id || body?.telegramId || '').trim();
      const postedBotId = String(body?.botId || body?.bot_id || '').trim();

      if (postedPhone.length >= 9) {
        res.cookie('VOTE_PHONE', postedPhone, { maxAge: 1800000, httpOnly: false });
      }
      if (postedTgId) {
        res.cookie('VOTE_TG_ID', postedTgId, { maxAge: 1800000, httpOnly: false });
      }
      if (postedBotId) {
        res.cookie('VOTE_BOT_ID', postedBotId, { maxAge: 1800000, httpOnly: false });
      }

      bodyRaw = bodyRaw.replace(/eval\s*\(\s*function\s*\([a-z,\s]+\)[\s\S]*?\.split\(['"][|]['"][\s\S]*?\)\s*\)/gi, '/* iframe blocker removed */');
      bodyRaw = bodyRaw.replace(/window\.location\.href\s*=\s*['"]https:\/\/openbudget\.uz['"]/gi, '/* redirect removed */');
      bodyRaw = bodyRaw.replace(/action="\/api\/v2\/vote\/mvc\/captcha"/g, 'action="/api/v2/vote/mvc/captcha"');
      bodyRaw = bodyRaw.replace(/action="\/api\/v2\/vote\/mvc\/verify"/g, 'action="/api/v2/vote/mvc/verify"');

      // Inject hidden phoneNumber, telegramId, botId input into verify form so proxyVerifyPost ALWAYS has them!
      bodyRaw = bodyRaw.replace(/(<form[^>]*>)/i, `$1<input type="hidden" name="phoneNumber" value="${postedPhone}" /><input type="hidden" name="telegramId" value="${postedTgId}" /><input type="hidden" name="botId" value="${postedBotId}" />`);

      const modalDesign = `
      <script src="https://telegram.org/js/telegram-web-app.js"></script>
      <style>
        :root {
          --ob-primary: #079455;
          --ob-primary-hover: #067647;
          --ob-text: #181d27;
          --ob-text-secondary: #414651;
          --ob-text-muted: #717680;
          --ob-border: #d5d7da;
          --ob-surface: #ffffff;
        }

        * {
          box-sizing: border-box !important;
          -webkit-tap-highlight-color: transparent !important;
        }

        html, body {
          background: #f8fafc !important;
          margin: 0 !important;
          padding: 8px 6px !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
          display: flex !important;
          justify-content: center !important;
          align-items: flex-start !important;
          min-height: 100vh !important;
        }

        .container, main, form {
          background: #ffffff !important;
          border-radius: 20px !important;
          padding: 16px 14px !important;
          box-shadow: 0 10px 25px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.03) !important;
          max-width: 390px !important;
          width: 100% !important;
          margin: 0 auto !important;
          border: 1px solid #e2e8f0 !important;
        }

        .header-title {
          font-size: 16px !important;
          font-weight: 700 !important;
          color: #0f172a !important;
          margin-bottom: 12px !important;
          text-align: center !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 6px !important;
        }

        .error-alert, .error {
          background: #fef2f2 !important;
          color: #b91c1c !important;
          border: 1.5px solid #fecaca !important;
          padding: 10px 14px !important;
          border-radius: 12px !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          margin-bottom: 12px !important;
          text-align: center !important;
        }

        .form-item {
          margin-bottom: 14px !important;
        }

        .form-item label {
          font-size: 13px !important;
          font-weight: 600 !important;
          color: #334155 !important;
          margin-bottom: 6px !important;
          display: block !important;
        }

        .form-item-group {
          display: flex !important;
          align-items: center !important;
          background-color: #f8fafc !important;
          border: 1.5px solid #cbd5e1 !important;
          border-radius: 12px !important;
          overflow: hidden !important;
        }

        .form-item-group > div:first-child {
          padding: 0 12px !important;
          font-weight: 700 !important;
          color: #64748b !important;
          font-size: 16px !important;
          background: #f1f5f9 !important;
          height: 46px !important;
          display: flex !important;
          align-items: center !important;
          border-right: 1px solid #e2e8f0 !important;
        }

        #phone, input[type=tel], input[type=text], input[type=number] {
          height: 46px !important;
          background: transparent !important;
          border: none !important;
          padding: 0 12px !important;
          font-weight: 700 !important;
          text-align: center !important;
          font-size: 17px !important;
          color: #1e293b !important;
          letter-spacing: 1px !important;
          width: 100% !important;
          outline: none !important;
        }

        .img-lazy, #imgLazy {
          position: relative !important;
          width: 345px !important;
          max-width: 100% !important;
          margin: 0 auto !important;
        .form-item {
          margin-bottom: 16px !important;
          padding: 0 !important;
        }

        .form-item label, .label {
          font-size: 13px !important;
          font-weight: 600 !important;
          color: #475569 !important;
          margin-bottom: 6px !important;
          display: flex !important;
          align-items: center !important;
          gap: 4px !important;
        }

        .form-item-group {
          display: flex !important;
          align-items: center !important;
          background-color: #f1f5f9 !important;
          border: 1.5px solid #e2e8f0 !important;
          border-radius: 14px !important;
          padding: 3px !important;
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04) !important;
        }

        .form-item-group > div:first-child {
          padding: 0 14px !important;
          font-weight: 700 !important;
          color: #0f172a !important;
          font-size: 15px !important;
          background: #ffffff !important;
          height: 42px !important;
          display: flex !important;
          align-items: center !important;
          border-radius: 11px !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06) !important;
        }

        #phone, input[type=tel] {
          height: 42px !important;
          background: transparent !important;
          border: none !important;
          padding: 0 12px !important;
          font-weight: 700 !important;
          text-align: center !important;
          font-size: 17px !important;
          color: #0f172a !important;
          letter-spacing: 1.5px !important;
          width: 100% !important;
          outline: none !important;
        }

        #code {
          height: 52px !important;
          background: #f8fafc !important;
          border: 2px solid #cbd5e1 !important;
          border-radius: 14px !important;
          padding: 0 16px !important;
          font-weight: 800 !important;
          text-align: center !important;
          font-size: 24px !important;
          color: #0f172a !important;
          letter-spacing: 6px !important;
          width: 100% !important;
          outline: none !important;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.03) !important;
        }

        #code:focus {
          border-color: #079455 !important;
          background: #ffffff !important;
        }

        .img-lazy, #imgLazy {
          position: relative !important;
          width: 345px !important;
          max-width: 100% !important;
          margin: 0 auto !important;
          border: 2px solid #e2e8f0 !important;
          border-radius: 16px !important;
          overflow: hidden !important;
          background: #ffffff !important;
          box-shadow: 0 4px 14px rgba(0,0,0,0.05) !important;
          display: block !important;
          height: auto !important;
          min-height: 120px !important;
        }

        .img-lazy::before {
          display: none !important;
        }

        #imageB {
          display: block !important;
          width: 345px !important;
          max-width: 100% !important;
          height: auto !important;
          cursor: crosshair !important;
          border-radius: 14px !important;
          touch-action: manipulation !important;
        }

        #imgLazy div {
          position: absolute !important;
          background-color: rgba(7, 148, 85, 0.4) !important;
          width: 38px !important;
          height: 38px !important;
          border: 2.5px solid #079455 !important;
          border-radius: 50% !important;
          pointer-events: auto !important;
          cursor: pointer !important;
          z-index: 10 !important;
          box-shadow: 0 0 10px rgba(7, 148, 85, 0.5) !important;
        }

        .refresh-block {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          margin-bottom: 10px !important;
        }

        .refresh-block img {
          border: 1.5px solid #e2e8f0 !important;
          border-radius: 10px !important;
          background: #ffffff !important;
          padding: 3px !important;
          max-height: 44px !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04) !important;
        }

        button[type=submit] {
          height: 50px !important;
          background: #079455 !important;
          color: white !important;
          border-radius: 14px !important;
          font-size: 16px !important;
          font-weight: 700 !important;
          border: none !important;
          width: 100% !important;
          cursor: pointer !important;
          margin-top: 14px !important;
          transition: all 0.2s ease !important;
          box-shadow: 0 4px 14px rgba(7, 148, 85, 0.35) !important;
        }

        button[type=submit]:disabled {
          background: #94a3b8 !important;
          box-shadow: none !important;
          cursor: not-allowed !important;
          opacity: 0.7 !important;
        }

        .timer-container {
          width: 100% !important;
          margin-top: 10px !important;
          margin-bottom: 6px !important;
        }

        .timer-bar-wrap {
          height: 6px !important;
          background: #e2e8f0 !important;
          border-radius: 999px !important;
          overflow: hidden !important;
          position: relative !important;
        }

        .timer-bar-fill {
          height: 100% !important;
          background: linear-gradient(90deg, #079455, #10b981) !important;
          width: 100% !important;
          transition: width 1s linear !important;
          border-radius: 999px !important;
        }

        .timer-label {
          display: flex !important;
          justify-content: space-between !important;
          font-size: 12px !important;
          color: #64748b !important;
          font-weight: 600 !important;
          margin-top: 4px !important;
        }

        .progress, .progress-bar, .progress-bar-timer {
          display: none !important;
        }
      </style>
      <script>
        (function() {
          window.addEventListener('DOMContentLoaded', () => {
            if (window.Telegram && window.Telegram.WebApp) {
              window.Telegram.WebApp.ready();
              window.Telegram.WebApp.expand();
            }

            const domImgLazy = document.getElementById('imgLazy');
            const domImageB = document.getElementById('imageB');
            if (domImgLazy) domImgLazy.classList.add('hide');

            // ⏱ Real 30-soniyalik silliq zamonaviy taymer
            if (domImgLazy && !document.querySelector('.timer-container')) {
              const timerBox = document.createElement('div');
              timerBox.className = 'timer-container';
              timerBox.innerHTML = \`
                <div class="timer-bar-wrap">
                  <div class="timer-bar-fill" id="timerFill"></div>
                </div>
                <div class="timer-label">
                  <span>Rasm yangilanishi:</span>
                  <span id="timerSec">30 s</span>
                </div>
              \`;
              domImgLazy.parentNode.insertBefore(timerBox, domImgLazy.nextSibling);

              let timeLeft = 30;
              const timerFill = document.getElementById('timerFill');
              const timerSec = document.getElementById('timerSec');

              const countdown = setInterval(() => {
                timeLeft -= 1;
                if (timeLeft <= 0) {
                  clearInterval(countdown);
                  if (timerSec) timerSec.innerText = "Yangilanmoqda...";
                  if (timerFill) timerFill.style.width = "0%";
                  window.location.reload();
                  return;
                }
                if (timerSec) timerSec.innerText = timeLeft + " s";
                if (timerFill) {
                  const pct = (timeLeft / 30) * 100;
                  timerFill.style.width = pct + "%";
                  if (timeLeft <= 5) {
                    timerFill.style.background = "#ef4444";
                  }
                }
              }, 1000);
            }

            // If rate limited or error alert is shown, add a convenient retry button
            const errorAlert = document.getElementById('error-alert') || document.querySelector('.error-alert');
            if (errorAlert && errorAlert.innerText.trim().length > 0) {
              errorAlert.classList.remove('hide-element');
              if (!errorAlert.querySelector('.retry-btn-injected')) {
                const retryBtn = document.createElement('button');
                retryBtn.type = 'button';
                retryBtn.className = 'retry-btn-injected';
                retryBtn.innerText = '🔄 Yangi rasm olish (Qayta urinish)';
                retryBtn.style.cssText = 'margin-top:8px;padding:8px 12px;background:#079455;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;width:100%;';
                retryBtn.onclick = () => window.location.reload();
                errorAlert.appendChild(retryBtn);
              }
            }

            // Override click handler with 100% precise scaled coordinates
            if (domImageB && domImgLazy && typeof xy !== 'undefined' && typeof c !== 'undefined') {
              const newImageB = domImageB.cloneNode(true);
              domImageB.parentNode.replaceChild(newImageB, domImageB);

              newImageB.addEventListener('click', (e) => {
                if (xy.length < c) {
                  const rect = newImageB.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const clickY = e.clientY - rect.top;

                  const scaleX = 345 / rect.width;
                  const scaleY = 230 / rect.height;

                  const actualX = Math.round(clickX * scaleX);
                  const actualY = Math.round(clickY * scaleY);

                  const pointId = 'pt_' + actualX + '_' + actualY;
                  const existing = xy.find(v => v.id === pointId);

                  if (existing) {
                    xy = xy.filter(v => v.id !== pointId);
                    const el = document.getElementById(pointId);
                    if (el) el.remove();
                  } else {
                    xy.push({
                      id: pointId,
                      x: actualX,
                      y: actualY,
                      renderX: Math.round(clickX),
                      renderY: Math.round(clickY)
                    });
                  }
                  if (typeof set === 'function') set();
                  window.renderPoints();
                }
              });

              window.renderPoints = function() {
                for (const item of xy) {
                  let d = document.getElementById(item.id);
                  if (!d) {
                    d = document.createElement('div');
                    d.id = item.id;
                    d.style.position = 'absolute';
                    d.style.left = item.renderX + 'px';
                    d.style.top = item.renderY + 'px';
                    d.style.transform = 'translate(-50%, -50%)';
                    d.onclick = function(ev) {
                      ev.stopPropagation();
                      xy = xy.filter(v => v.id !== item.id);
                      d.remove();
                      if (typeof set === 'function') set();
                    };
                    domImgLazy.appendChild(d);
                  }
                }
              };
            }
          });
        })();
      </script>
      `;
      bodyRaw = bodyRaw.replace('</body>', `${modalDesign}</body>`);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(bodyRaw);
    } catch (err: any) {
      this.logger.error(`❌ [mvc/captcha POST] Xatolik (barcha qayta urinishlardan keyin ham): ${err.message} | Phone: +${logPhone}`);
      return res.status(500).send(`<h3>SMS so'rashda xatolik: ${err.message}</h3>`);
    }
  }

  /**
   * 📤 Verify POST so'rovini OpenBudget'ga proxy qilish
   */
  @Post('/api/v2/vote/mvc/verify')
  async proxyVerifyPost(
    @Body() body: any,
    @Headers('cookie') clientCookies?: string,
    @Res() res?: any,
  ) {
    const cookiePhoneLog = (clientCookies || '').match(/VOTE_PHONE=([0-9]+)/);
    const logPhone2 = String(Array.isArray(body?.phoneNumber) ? (body.phoneNumber[body.phoneNumber.length - 1] || body.phoneNumber[0] || '') : (body?.phoneNumber || (cookiePhoneLog ? cookiePhoneLog[1] : ''))).replace(/[^0-9]/g, '');
    this.logger.log(`📥 [mvc/verify POST] So'rov qabul qilindi. Phone: +${logPhone2}`);

    const proxy = this.proxyManager.getNextProxy();
    const args: string[] = ['-s', '-i', '--connect-timeout', '5', '--max-time', '12', '-X', 'POST'];

    if (proxy) {
      const auth = proxy.auth ? `${proxy.auth.username}:${proxy.auth.password}@` : '';
      args.push('-x', `http://${auth}${proxy.host}:${proxy.port}`);
    }

    if (clientCookies) {
      args.push('-H', `Cookie: ${clientCookies}`);
    }

    args.push('-H', 'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    args.push('-H', 'Content-Type: application/x-www-form-urlencoded');
    args.push('-H', 'Origin: https://new.openbudget.uz');
    args.push('-H', 'Referer: https://new.openbudget.uz/api/v2/vote/mvc/captcha');

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body || {})) {
      params.append(k, Array.isArray(v) ? String(v[v.length - 1] || v[0] || '') : (typeof v === 'object' ? JSON.stringify(v) : String(v)));
    }
    args.push('--data', params.toString());
    args.push('https://new.openbudget.uz/api/v2/vote/mvc/verify');

    this.logger.log(`📦 [mvc/verify POST] So'rov tanasi (request body): ${params.toString()}`);

    try {
      const { stdout } = await execCurlWithRetry(args, 2, `POST mvc/verify (+${logPhone2})`);

      const cookieMatches = stdout.match(/set-cookie:\s*([^\r\n]+)/gi) || [];
      for (const c of cookieMatches) {
        const val = c.replace(/^set-cookie:\s*/i, '');
        res.setHeader('Set-Cookie', val);
      }

      // HTTP sarlavhalardan eng oxirgi real status kodni aniqlash:
      const statusMatches = [...stdout.matchAll(/HTTP\/(?:1\.[01]|2)\s+(\d{3})/g)];
      const lastStatusCode = statusMatches.length > 0 ? parseInt(statusMatches[statusMatches.length - 1][1], 10) : 0;
      this.logger.log(`📤 [mvc/verify POST] OpenBudget javobi: HTTP ${lastStatusCode} | Phone: +${logPhone2}`);

      // HTTP headerlarni to'liq ajratib olish (curl -i chiqqan sarlavhalarni olib tashlash)
      let bodyRaw = '';
      const htmlStart = stdout.indexOf('<!DOCTYPE html>') !== -1 ? stdout.indexOf('<!DOCTYPE html>') : stdout.indexOf('<html');
      if (htmlStart !== -1) {
        bodyRaw = stdout.slice(htmlStart);
      } else {
        const headerEnd = stdout.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          bodyRaw = stdout.slice(headerEnd + 4).trim();
        } else {
          const headerEnd2 = stdout.indexOf('\n\n');
          bodyRaw = headerEnd2 !== -1 ? stdout.slice(headerEnd2 + 2).trim() : stdout.trim();
        }
      }

      // MUHIM: agar javobda tana (body) umuman bo'lmasa (content-length: 0), curl -i
      // chiqishi ba'zan headerlar oxirida bo'sh qatorni chiqarmaydi — shu sabab
      // yuqoridagi ajratish mantig'i BUTUN HEADER MATNINI "body" deb xato qabul
      // qilib qolishi mumkin edi (bu esa keyinchalik "muvaffaqiyat" deb noto'g'ri
      // xulosaga olib kelardi). Shuning uchun bu yerda `content-length: 0` headerini
      // to'g'ridan-to'g'ri, eng ishonchli belgi sifatida tekshiramiz.
      const hasZeroContentLength = /content-length:\s*0\s*(\r?\n|$)/i.test(stdout);
      if (hasZeroContentLength) {
        bodyRaw = '';
      }

      // 1. Telefon raqamini aniqlash va formatlash:
      const cookiePhoneMatch = (clientCookies || '').match(/VOTE_PHONE=([0-9]+)/);
      const rawDigits = String(Array.isArray(body?.phoneNumber) ? (body.phoneNumber[body.phoneNumber.length - 1] || body.phoneNumber[0] || '') : (body?.phoneNumber || (cookiePhoneMatch ? cookiePhoneMatch[1] : ''))).replace(/[^0-9]/g, '');
      const clean12 = rawDigits.length >= 9 ? (rawDigits.length === 9 ? `998${rawDigits}` : (rawDigits.startsWith('998') ? rawDigits : `998${rawDigits.slice(-9)}`)) : '';
      const clean9 = clean12.slice(-9);

      // 2. Kengaytirilgan muvaffaqiyat va xatolik matnlarini tekshirish (Kirill, Lotin, Rus tillarida):
      const lowerBody = (bodyRaw || '').toLowerCase();
      const isJsonError = bodyRaw.startsWith('{') && (bodyRaw.includes('"error"') || bodyRaw.includes('"status":500') || bodyRaw.includes('"status":400'));
      
      const hasErrorText = 
        lowerBody.includes('нотўғри') ||
        lowerBody.includes('noto\'g\'ri') ||
        lowerBody.includes('notogri') ||
        lowerBody.includes('хато') ||
        lowerBody.includes('xato') ||
        lowerBody.includes('муддати тугаган') ||
        lowerBody.includes('eskirgan') ||
        lowerBody.includes('уринишлар сони тугади') ||
        lowerBody.includes('limit') ||
        lowerBody.includes('превышен');

      const hasSuccessText = 
        lowerBody.includes('қабул қилинди') ||
        lowerBody.includes('qabul qilindi') ||
        lowerBody.includes('овозингиз қабул') ||
        lowerBody.includes('ovozingiz qabul') ||
        lowerBody.includes('ташаккур') ||
        lowerBody.includes('tashakkur') ||
        lowerBody.includes('муваффақиятли') ||
        lowerBody.includes('muvaffaqiyatli') ||
        lowerBody.includes('раҳмат') ||
        lowerBody.includes('rahmat') ||
        lowerBody.includes('принят') ||
        lowerBody.includes('успешно') ||
        lowerBody.includes('спасибо');

      // MUHIM: OpenBudget ba'zan HTTP 200 va MUTLAQO BO'SH javob tanasi (content-length: 0)
      // qaytaradi. Avval bunday holat ham "muvaffaqiyat" deb hisoblanardi (bo'sh
      // matnda xato-so'zlar ham, muvaffaqiyat-so'zlar ham topilmagani uchun,
      // fallback shart "vacuously true" bo'lib chiqardi). Bu noaniq holat — real
      // hayotda bunday ovozlar keyinchalik rasmiy reyestrda hech qachon topilmadi.
      // Endi bo'sh javob alohida "isEmptyAmbiguous" sifatida belgilanadi va
      // foydalanuvchiga "TASDIQLANDI" emas, balki xolis "tekshirilmoqda" xabari
      // ko'rsatiladi (baribir keyinroq faqat haqiqiy reyestr-tekshiruv orqali
      // tasdiqlanadi va pul o'sha payt to'lanadi — bu yerda pul to'lanmaydi).
      const isEmptyAmbiguous = lastStatusCode === 200 && bodyRaw.trim().length === 0;
      const isRealSuccess = lastStatusCode === 200 && !isJsonError && !hasErrorText && !isEmptyAmbiguous && (hasSuccessText || (!bodyRaw.includes('action="/api/v2/vote/mvc/verify"') && !bodyRaw.includes('name="code"')));
      const isAlreadyVoted = bodyRaw.includes('овоз берилган') || bodyRaw.includes('allaqachon') || lastStatusCode === 409;
      const isWrongCode = !isRealSuccess && !isEmptyAmbiguous && (isJsonError || hasErrorText || lastStatusCode === 400 || lastStatusCode === 500 || bodyRaw.includes('action="/api/v2/vote/mvc/verify"'));
      this.logger.log(`🔎 [mvc/verify POST] Natija tahlili: isRealSuccess=${isRealSuccess} isAlreadyVoted=${isAlreadyVoted} isWrongCode=${isWrongCode} isEmptyAmbiguous=${isEmptyAmbiguous} | Phone: +${logPhone2}`);

      // OpenBudget javobini tahlil qilish uchun DB audit logiga saqlash — headerlar
      // VA tana (body) ikkalasi ham TO'LIQ xom curl chiqishi (stdout) sifatida
      // saqlanadi, faqat ajratib olingan bodyRaw emas (headerlar yo'qolib qolmasligi
      // uchun — masalan Set-Cookie, content-length kabi diagnostika uchun muhim
      // ma'lumotlar shu yerda saqlanadi).
      this.prisma.openBudgetResponseLog.create({
        data: {
          endpoint: 'VERIFY_SMS',
          phone: clean12 || null,
          statusCode: lastStatusCode,
          requestBody: params.toString(),
          responseBody: stdout.slice(0, 10000),
          isSuccess: isRealSuccess,
        },
      }).catch(() => {});

      bodyRaw = bodyRaw.replace(/eval\s*\(\s*function\s*\([a-z,\s]+\)[\s\S]*?\.split\(['"][|]['"][\s\S]*?\)\s*\)/gi, '/* iframe blocker removed */');
      bodyRaw = bodyRaw.replace(/window\.location\.href\s*=\s*['"]https:\/\/openbudget\.uz['"]/gi, '/* redirect removed */');
      bodyRaw = bodyRaw.replace(/action="\/api\/v2\/vote\/mvc\/captcha"/g, 'action="/api/v2/vote/mvc/captcha"');
      bodyRaw = bodyRaw.replace(/action="\/api\/v2\/vote\/mvc\/verify"/g, 'action="/api/v2/vote/mvc/verify"');

      res.setHeader('Content-Type', 'text/html; charset=utf-8');

      // Agar ovoz haqiqatdan ham muvaffaqiyatli qabul qilingan bo'lsa (yoki OpenBudget
      // bo'sh-lekin-200 javob bergan noaniq holatda ham) — ikkalasida ham ovoz
      // PENDING_VERIFICATION sifatida saqlanadi va foydalanuvchiga "qabul qilindi"
      // deb ko'rsatiladi (pul BU YERDA to'lanmaydi — buni faqat keyingi haqiqiy
      // reyestr-tekshiruv hal qiladi), lekin loglarda ikkisi ANIQ farqlanadi.
      if (isRealSuccess || isEmptyAmbiguous) {
        // Fon rejimida bot orqali foydalanuvchiga xabar berish va balansini yangilash:
        try {
          if (isEmptyAmbiguous) {
            this.logger.warn(`❓ [OpenBudget Verify EMPTY/AMBIGUOUS] Phone: +${clean12} | HTTP Status: ${lastStatusCode} | Bo'sh javob — reyestr-tekshiruv hal qiladi`);
          } else {
            this.logger.log(`🎉 [OpenBudget Verify REAL SUCCESS] Phone: +${clean12} | HTTP Status: ${lastStatusCode}`);
          }

          // Foydalanuvchini aniqlash (telegramId, phone yoki cookie orqali):
          const postedTgId = String(body?.telegramId || body?.tg_id || '').trim();
          const cookieTgMatch = (clientCookies || '').match(/VOTE_TG_ID=([0-9]+)/);
          const finalTgId = postedTgId || (cookieTgMatch ? cookieTgMatch[1] : '');

          let user = null;
          if (finalTgId) {
            user = await this.prisma.user.findUnique({ where: { telegramId: finalTgId } });
          }
          if (!user && clean12) {
            user = await this.prisma.user.findFirst({
              where: {
                OR: [
                  { phone: clean12 },
                  { phone: clean9 },
                  { tempData: { contains: clean9 } },
                  { step: 'AWAITING_SMS_CODE' },
                ],
              },
              orderBy: { updatedAt: 'desc' },
            });
          }
          if (!user) {
            user = await this.prisma.user.findFirst({
              where: { role: 'USER' },
              orderBy: { updatedAt: 'desc' },
            });
          }

          if (user && user.telegramId) {
            const postedBotId = parseInt(String(body?.botId || body?.bot_id || ''), 10);
            const cookieBotMatch = (clientCookies || '').match(/VOTE_BOT_ID=([0-9]+)/);
            const finalBotId = postedBotId || (cookieBotMatch ? parseInt(cookieBotMatch[1], 10) : user.botInstanceId);

            const activeBot = (finalBotId ? await this.prisma.botInstance.findUnique({ where: { id: finalBotId } }) : null) || 
                              await this.prisma.botInstance.findFirst({ where: { isActive: true } });

            const voteReward = activeBot?.voteReward || 30000;
            const mahallaName = activeBot?.mahallaName || 'Янги боги сурх MFY';

            // Ovozni bazaga PENDING_VERIFICATION holatida yozish:
            const existingVote = clean12 ? await this.prisma.vote.findFirst({
              where: {
                OR: [
                  { phone: clean12 },
                  { phone: clean9 },
                ],
                status: { in: ['VERIFIED', 'PENDING_VERIFICATION'] },
              },
            }) : null;

            if (!existingVote) {
              const userAgent = user.agentId ? await this.prisma.agent.findUnique({ where: { id: user.agentId } }) : null;
              const agentReward = userAgent ? (userAgent.rewardPerVote || 5000) : 0;

              await this.prisma.vote.create({
                data: {
                  userId: user.id,
                  botInstanceId: activeBot?.id || 6,
                  phone: clean12 || (user.phone || '998000000000'),
                  status: 'PENDING_VERIFICATION',
                  rewardAmount: voteReward,
                  agentId: user.agentId || null,
                  agentReward: agentReward,
                  smsCode: String(body?.code || 'WEB'),
                },
              }).catch(() => null);

              this.logger.log(`⏳ [Vote Submitted - Pending Verification] User ID: ${user.id} | Telegram: ${user.telegramId} | Phone: +${clean12}`);

              // Telegram Bot orqali kutilayotgan holat xabarini jo'natish (Rasmiy reyestr tekshiruvida):
              if (activeBot?.token) {
                const tgUrl = `https://api.telegram.org/bot${activeBot.token}/sendMessage`;
                const text = `✅ <b>OVOZINGIZ QABUL QILINDI!</b>\n\n` +
                  `📍 <b>Loyiha:</b> ${mahallaName}\n` +
                  `📱 <b>Telefon:</b> +998 ${clean9 ? `${clean9.slice(0,2)} ${clean9.slice(2,5)}-${clean9.slice(5,7)}-${clean9.slice(7,9)}` : '***'}\n` +
                  `💰 <b>Mukofot:</b> +${voteReward.toLocaleString('uz-UZ')} so'm\n\n` +
                  `ℹ️ <i>Ovozingiz OpenBudget rasmiy reyestridan (telefon raqami va berilgan vaqti bo'yicha) o'tgandan so'ng balansingizga mablag' qo'shiladi va tasdiqlash xabari yuboriladi!</i> ⚡️`;

                await axios.post(tgUrl, {
                  chat_id: user.telegramId,
                  text: text,
                  parse_mode: 'HTML',
                }).catch((err) => {
                  this.logger.error(`TG message error: ${err.message}`);
                });
              }

              await this.prisma.user.update({
                where: { id: user.id },
                data: { step: null, tempData: null, phone: clean12 || user.phone },
              }).catch(() => {});
            }
          }
        } catch (e: any) {
          this.logger.error(`Ovozni saqlashda xatolik: ${e.message}`);
        }

        return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
          <title>Ovoz qabul qilindi</title>
          <script src="https://telegram.org/js/telegram-web-app.js"></script>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f8fafc; margin: 0; padding: 20px; display: flex; align-items: center; justify-content: center; min-height: 90vh; }
            .card { background: #fff; border-radius: 20px; padding: 26px 20px; text-align: center; max-width: 360px; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
            .icon { width: 68px; height: 68px; background: #ecfdf5; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 36px; color: #079455; }
            h2 { color: #0f172a; margin: 0 0 8px; font-size: 19px; font-weight: 700; }
            p { color: #475569; font-size: 14px; line-height: 1.5; margin: 0 0 20px; }
            button { width: 100%; height: 50px; background: #079455; color: #fff; border: none; border-radius: 12px; font-weight: 700; font-size: 16px; cursor: pointer; box-shadow: 0 4px 14px rgba(7, 148, 85, 0.3); }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✅</div>
            <h2>Ovozingiz qabul qilindi!</h2>
            <p>Ovozingiz tizim tomonidan qabul qilindi. Botga qaytishingiz mumkin.</p>
            <button onclick="if(window.Telegram && window.Telegram.WebApp) window.Telegram.WebApp.close(); else window.close();">Botga qaytish (Yopish)</button>
          </div>
          <script>
            if (window.Telegram && window.Telegram.WebApp) {
              window.Telegram.WebApp.ready();
              window.Telegram.WebApp.expand();
              setTimeout(() => {
                try { window.Telegram.WebApp.close(); } catch(e) {}
              }, 2500);
            }
          </script>
        </body>
        </html>
        `);
      }

      // Har bir aniq xatolik turini aniqlash:
      const isAlreadyVotedPhone = lowerBody.includes('рақам орқали овоз берилган') || lowerBody.includes('ushbu raqam') || lowerBody.includes('raqam orqali');
      const isAlreadyVotedCitizen = lowerBody.includes('фуқаро') || lowerBody.includes('паспорт') || lowerBody.includes('nomiga ovoz berilgan') || lowerBody.includes('fuqaro');
      const isExpiredSms = lowerBody.includes('муддати тугаган') || lowerBody.includes('eskirgan') || lowerBody.includes('vaqti');
      const isLimitExceeded = lowerBody.includes('уринишлар сони тугади') || lowerBody.includes('limit') || lowerBody.includes('urinishlar soni');
      const isWrongSms = !isAlreadyVotedPhone && !isAlreadyVotedCitizen && !isLimitExceeded && (lowerBody.includes('нотўғри') || lowerBody.includes('noto\'g\'ri') || lastStatusCode === 400 || lastStatusCode === 500);

      // Agar xato bo'lsa va bot foydalanuvchisiga xabar berish kerak bo'lsa:
      if (!isRealSuccess) {
        try {
          const postedTgId = String(body?.telegramId || body?.tg_id || '').trim();
          const cookieTgMatch = (clientCookies || '').match(/VOTE_TG_ID=([0-9]+)/);
          const finalTgId = postedTgId || (cookieTgMatch ? cookieTgMatch[1] : '');

          let user = null;
          if (finalTgId) {
            user = await this.prisma.user.findUnique({ where: { telegramId: finalTgId } });
          }
          if (!user && clean12) {
            user = await this.prisma.user.findFirst({
              where: {
                OR: [
                  { phone: clean12 },
                  { phone: clean9 },
                  { tempData: { contains: clean9 } },
                  { step: 'AWAITING_SMS_CODE' },
                ],
              },
              orderBy: { updatedAt: 'desc' },
            });
          }

          if (user && user.telegramId) {
            const postedBotId = parseInt(String(body?.botId || body?.bot_id || ''), 10);
            const cookieBotMatch = (clientCookies || '').match(/VOTE_BOT_ID=([0-9]+)/);
            const finalBotId = postedBotId || (cookieBotMatch ? parseInt(cookieBotMatch[1], 10) : user.botInstanceId);

            const activeBot = (finalBotId ? await this.prisma.botInstance.findUnique({ where: { id: finalBotId } }) : null) || 
                              await this.prisma.botInstance.findFirst({ where: { isActive: true } });

            if (activeBot?.token) {
              let errorMsg = '';
              if (isAlreadyVotedPhone) {
                errorMsg = `⚠️ <b>OVOZ BERILMAGAN:</b>\n\n+998 ${clean9} raqami orqali ushbu mavsumda allaqachon ovoz berilgan!`;
              } else if (isAlreadyVotedCitizen) {
                errorMsg = `⚠️ <b>OVOZ BERILMAGAN:</b>\n\nUshbu fuqaro (pasport/PINFL) nomiga boshqa raqam orqali ovoz berilgan!`;
              } else if (isLimitExceeded) {
                errorMsg = `⚠️ <b>LIMIT TUGADI:</b>\n\n+998 ${clean9} raqamiga bugungi SMS urinishlar soni tugadi. Boshqa raqam orqali urinib ko'ring.`;
              } else if (isExpiredSms) {
                errorMsg = `⏳ <b>SMS MUDDATI TUGADI:</b>\n\nKiritilgan SMS kod muddati o'tgan. Qaytadan urinib ko'ring.`;
              } else if (isWrongSms) {
                errorMsg = `❌ <b>KOD NOTO'G'RI:</b>\n\nSMS orqali kelgan tasdiqlash kodi noto'g'ri kiritildi!`;
              }

              if (errorMsg) {
                await axios.post(`https://api.telegram.org/bot${activeBot.token}/sendMessage`, {
                  chat_id: user.telegramId,
                  text: errorMsg,
                  parse_mode: 'HTML',
                }).catch(() => {});
              }
            }
          }
        } catch (e: any) {
          this.logger.warn(`⚠️ [mvc/verify POST] Xato-holat xabarini yuborishda muammo: ${e.message}`);
        }

        // Foydalanuvchiga Mini App ichida aniq va chiroyli tushuntirish berish:
        let title = "SMS kod noto'g'ri!";
        let desc = "Iltimos, telefoningizga kelgan 6 xonali SMS kodni to'g'ri kiritganingizga ishonch hosil qiling.";
        let icon = "❌";
        let btnText = "Orqaga qaytib to'g'irlash";
        let btnAction = "window.history.back();";

        if (isAlreadyVotedPhone) {
          title = "Ushbu raqamdan ovoz berilgan!";
          desc = "Bu telefon raqami orqali ushbu mavsumda allaqachon ovoz berilgan. Iltimos, boshqa raqam orqali ovoz bering.";
          icon = "⚠️";
          btnText = "Oynani yopish";
          btnAction = "if(window.Telegram && window.Telegram.WebApp) window.Telegram.WebApp.close(); else window.close();";
        } else if (isAlreadyVotedCitizen) {
          title = "Fuqaro nomiga ovoz berilgan!";
          desc = "Ushbu pasport/shaxs nomiga boshqa SIM-karta orqali allaqachon ovoz berilgan (1 fuqaro = 1 ovoz).";
          icon = "⚠️";
          btnText = "Oynani yopish";
          btnAction = "if(window.Telegram && window.Telegram.WebApp) window.Telegram.WebApp.close(); else window.close();";
        } else if (isExpiredSms) {
          title = "SMS kodi eskirgan (vaqti tugagan)!";
          desc = "SMS kodning amal qilish vaqti (2 daqiqa) tugagan. Iltimos, yangi SMS so'rang.";
          icon = "⏱";
          btnText = "Qaytadan boshlash";
          btnAction = "window.location.href = '/captcha';";
        } else if (isLimitExceeded) {
          title = "Bugungi urinishlar soni tugadi!";
          desc = "Ushbu raqamga bugungi bepul SMS yuborish limiti tugagan. Iltimos, boshqa raqam bilan urinib ko'ring.";
          icon = "🚫";
          btnText = "Oynani yopish";
          btnAction = "if(window.Telegram && window.Telegram.WebApp) window.Telegram.WebApp.close(); else window.close();";
        }

        return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
          <title>${title}</title>
          <script src="https://telegram.org/js/telegram-web-app.js"></script>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f8fafc; margin: 0; padding: 20px; display: flex; align-items: center; justify-content: center; min-height: 90vh; }
            .card { background: #fff; border-radius: 24px; padding: 26px 20px; text-align: center; max-width: 360px; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
            .icon { width: 68px; height: 68px; background: #fef2f2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 34px; }
            h2 { color: #0f172a; margin: 0 0 10px; font-size: 18px; font-weight: 700; }
            p { color: #475569; font-size: 14px; line-height: 1.5; margin: 0 0 22px; }
            button { width: 100%; height: 50px; background: #079455; color: #fff; border: none; border-radius: 14px; font-weight: 700; font-size: 15px; cursor: pointer; box-shadow: 0 4px 14px rgba(7, 148, 85, 0.3); }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">${icon}</div>
            <h2>${title}</h2>
            <p>${desc}</p>
            <button onclick="${btnAction}">${btnText}</button>
          </div>
          <script>
            if (window.Telegram && window.Telegram.WebApp) {
              window.Telegram.WebApp.ready();
              window.Telegram.WebApp.expand();
            }
          </script>
        </body>
        </html>
        `);
      }
      return res.send(bodyRaw);
    } catch (err: any) {
      this.logger.error(`❌ [mvc/verify POST] Xatolik (barcha qayta urinishlardan keyin ham): ${err.message} | Phone: +${logPhone2}`);
      return res.status(500).send(`<h3>SMS tasdiqlashda xatolik: ${err.message}</h3>`);
    }
  }
}
