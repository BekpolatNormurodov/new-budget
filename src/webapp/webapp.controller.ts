import { Controller, Get, Post, Body, Query, Headers, Res, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenBudgetService } from '../openbudget/openbudget.service';
import { VoteAutoApproverService } from '../openbudget/vote-auto-approver.service';
import { WalletService } from '../wallet/wallet.service';
import { ProxyManagerService } from '../proxy/proxy-manager.service';
import { ConfigService } from '@nestjs/config';
import { BOT_MESSAGES } from '../bot/bot.constants';
import { withPhoneLock } from '../common/phone-lock.util';
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

  // MUHIM: ba'zi holatlarda klient (mobil brauzer/Telegram WebView) SMS-kod
  // formasini bir necha soniya ichida IKKI marta yuboradi (ikki marta bosish,
  // sahifa qayta render bo'lishi va h.k.) — frontend'dagi JS himoyasi buni har
  // doim to'xtata olmaydi. Shu sababli bir xil (telefon+kod) juftligi uchun
  // OpenBudget'ning HAQIQIY serveriga qayta so'rov yuborilishini bu yerda,
  // backend darajasida, qat'iy to'sib qo'yamiz.
  private readonly recentVerifyAttempts = new Map<string, number>();
  private static readonly VERIFY_DEDUPE_TTL_MS = 10_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly openBudgetService: OpenBudgetService,
    private readonly walletService: WalletService,
    private readonly proxyManager: ProxyManagerService,
    private readonly configService: ConfigService,
    private readonly voteAutoApproverService: VoteAutoApproverService,
  ) {}

  private setProxyCookies(res: any, stdout: string, extraCookies?: Record<string, string>) {
    if (!res) return;
    const cookieMatches = stdout.match(/set-cookie:\s*([^\r\n]+)/gi) || [];
    const cookiesToSend: string[] = [];

    for (const c of cookieMatches) {
      let val = c.replace(/^set-cookie:\s*/i, '').trim();
      val = val.replace(/Domain=[^;]+;?/gi, '').trim();
      if (!/path=/i.test(val)) {
        val += '; Path=/';
      }
      cookiesToSend.push(val);
    }

    if (extraCookies) {
      for (const [k, v] of Object.entries(extraCookies)) {
        if (v) {
          cookiesToSend.push(`${k}=${encodeURIComponent(v)}; Max-Age=1800; Path=/`);
        }
      }
    }

    if (cookiesToSend.length > 0) {
      res.setHeader('Set-Cookie', cookiesToSend);
    }
  }

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

  // MUHIM: bu ikki endpoint ESKI (hozirgi rasmiy /captcha Mini App oqimidan
  // OLDINGI) arxitekturaga tegishli — hech qanday reyestr-tekshiruvi va hech
  // qanday dublikat-tekshiruvisiz to'g'ridan-to'g'ri "VERIFIED" deb yozib, zudlik
  // bilan pul to'lardi. Hech bir joriy bot tugmasi bularga bog'lanmagan, lekin
  // `public/app/index.html` orqali hali ham ochiq/himoyasiz qolgan edi — buni
  // moliyaviy xavfsizlik uchun butunlay o'chirib qo'yamiz.
  @Post('request-sms')
  async requestSms() {
    throw new BadRequestException('Bu usul faol emas. Iltimos, botdagi "🗳 Ovoz berish" tugmasidan foydalaning.');
  }

  @Post('verify-sms')
  async verifySms() {
    throw new BadRequestException('Bu usul faol emas. Iltimos, botdagi "🗳 Ovoz berish" tugmasidan foydalaning.');
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

    // MUHIM: "Жуда кўп сўровлар" (juda ko'p so'rov / rate-limit) chiqsa, buni
    // foydalanuvchiga xato sifatida ko'rsatish o'rniga, KO'RINMAS TARZDA
    // (proxy — Webshare rotating gateway — har yangi ulanishda AVTOMATIK yangi
    // IP beradi) bir necha marta qayta urinamiz. Aksariyat hollarda 1-2
    // urinishda o'tib ketadi va foydalanuvchi hech qanday to'xtalishni sezmay,
    // to'g'ridan-to'g'ri SMS-kod sahifasiga o'tadi. Faqat BARCHA urinishlar
    // ham rad etilsa, xato-karta ko'rsatiladi.
    const MAX_PAGE_ATTEMPTS = 5;
    let stdout = '';
    let getStatusCode = 0;
    let rateLimitMatch: RegExpMatchArray | null = null;

    for (let attempt = 1; attempt <= MAX_PAGE_ATTEMPTS; attempt++) {
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

      const result = await execCurlWithRetry(args, 2, `GET captcha-page (${attempt}/${MAX_PAGE_ATTEMPTS})`);
      stdout = result.stdout;
      const getStatusMatch = stdout.match(/HTTP\/(?:1\.[01]|2)\s+(\d{3})/g);
      getStatusCode = getStatusMatch ? parseInt(getStatusMatch[getStatusMatch.length - 1].match(/\d{3}/)![0], 10) : 0;
      rateLimitMatch = stdout.match(/Жуда\s*кўп\s*сўровлар|Juda\s*ko'p\s*so'rov/i);

      if (getStatusCode === 200) {
        if (attempt > 1) {
          this.logger.log(`✅ [GET captcha-page] ${attempt}-urinishda (yangi IP bilan) muvaffaqiyatli o'tdi.`);
        }
        break;
      }

      this.logger.warn(`⚠️ [GET captcha-page] ${attempt}/${MAX_PAGE_ATTEMPTS}-urinish rad etildi: HTTP ${getStatusCode}${rateLimitMatch ? ' | Tur: RATE_LIMIT (juda ko\'p so\'rov)' : ''}`);

      if (attempt < MAX_PAGE_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }

    try {
      this.logger.log(`📤 [GET captcha-page] OpenBudget javobi: HTTP ${getStatusCode || "noma'lum"}`);
      if (getStatusCode && getStatusCode !== 200) {
        // MUHIM: bu yergacha bo'lmasa, keyingi kod OpenBudget'ning XOM (bizning
        // dizaynimizga mos kelmaydigan, ko'pincha ruscha/kirillcha WAF) xato
        // sahifasini to'g'ridan-to'g'ri foydalanuvchiga ko'rsatib yuborardi —
        // bu chiroyli xato-kartalarimizdan farqli, "buzilgan sahifa"dek ko'rinib,
        // foydalanuvchini chalkashtirar edi. Endi bu holatda ham boshqa xatolar
        // kabi aniq, tushunarli va bizning dizaynimizga mos xabar ko'rsatiladi —
        // va bu FAQAT yuqoridagi barcha (yangi IP bilan qilingan) urinishlar
        // ham muvaffaqiyatsiz bo'lganda ko'rinadi.
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(`
          <!DOCTYPE html>
          <html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://telegram.org/js/telegram-web-app.js"></script>
          <style>
            body { font-family: -apple-system, sans-serif; background: #f8fafc; margin: 0; padding: 20px; display: flex; align-items: center; justify-content: center; min-height: 90vh; }
            .card { background: #fff; border-radius: 20px; padding: 26px 20px; text-align: center; max-width: 360px; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
            .icon { width: 68px; height: 68px; background: #fffbeb; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 36px; }
            h2 { color: #0f172a; margin: 0 0 8px; font-size: 19px; font-weight: 700; }
            p { color: #475569; font-size: 14px; line-height: 1.5; margin: 0 0 20px; }
            button { width: 100%; height: 50px; background: #f59e0b; color: #fff; border: none; border-radius: 12px; font-weight: 700; font-size: 16px; cursor: pointer; }
          </style></head>
          <body>
            <div class="card">
              <div class="icon">⏳</div>
              <h2>Sahifa hozircha ochilmadi</h2>
              <p>${rateLimitMatch
                ? "Hozir juda ko'p odam urinmoqda. Iltimos, 1-2 daqiqadan so'ng botdagi tugmani qayta bosing."
                : "OpenBudget serveridan vaqtincha javob kelmadi. Iltimos, birozdan so'ng botdagi tugmani qayta bosing."}</p>
              <button onclick="if(window.Telegram && window.Telegram.WebApp) window.Telegram.WebApp.close(); else window.close();">Botga qaytish</button>
            </div>
            <script>if (window.Telegram && window.Telegram.WebApp) { window.Telegram.WebApp.ready(); window.Telegram.WebApp.expand(); }</script>
          </body></html>
        `);
      }

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const cleanPhone = phoneQuery ? phoneQuery.replace(/[^0-9]/g, '').slice(-9) : '';
      this.setProxyCookies(res, stdout, {
        VOTE_TG_ID: tgIdQuery || '',
        VOTE_BOT_ID: botIdQuery || '',
        VOTE_PHONE: cleanPhone,
      });

      const htmlStart = stdout.indexOf('<!DOCTYPE html>') !== -1 ? stdout.indexOf('<!DOCTYPE html>') : stdout.indexOf('<html');
      let bodyRaw = htmlStart !== -1 ? stdout.slice(htmlStart) : stdout;

      // 1. Iframe anti-tamper redirectini (eval packerni) butunlay olib tashlash!
      bodyRaw = bodyRaw.replace(/eval\s*\(\s*function\s*\([a-z,\s]+\)[\s\S]*?\.split\(['"][|]['"][\s\S]*?\)\s*\)/gi, '/* iframe blocker removed */');
      bodyRaw = bodyRaw.replace(/window\.location\.href\s*=\s*['"]https:\/\/openbudget\.uz['"]/gi, '/* redirect removed */');

      // 2. OpenBudget ichki form action manzillarini bizning proxy endpointga moslash
      bodyRaw = bodyRaw.replace(/action="\/api\/v2\/vote\/mvc\/captcha"/g, 'action="/api/v2/vote/mvc/captcha"');
      bodyRaw = bodyRaw.replace(/action="\/api\/v2\/vote\/mvc\/verify"/g, 'action="/api/v2/vote/mvc/verify"');

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

        /* MUHIM: OpenBudget'ning o'z rasmi 345px bilan cheklangan (kichik,
           sichqoncha uchun mo'ljallangan). Mobil ekranda barmoq bilan aniq
           bosish qiyin bo'lgani uchun, rasmni ekran kengligiga qarab
           kattaroq ko'rsatamiz — koordinata hisob-kitobi (345x230 asl
           o'lchamga nisbatan) allaqachon istalgan ko'rsatilgan o'lchamga
           moslashadi, shuning uchun bu faqat ko'rinishni kattalashtiradi,
           yuborilgan koordinatalarga ta'sir qilmaydi. */
        .img-lazy, #imgLazy, #imageB {
          width: 100% !important;
          max-width: 480px !important;
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
            // MUHIM: OpenBudget'ga faqat XOM (formatlanmagan, probel/tiresiz) 9 xonali
            // raqam yuboriladi — avval bu yerda "95 064-28-27" kabi FAQAT KO'RSATISH
            // uchun formatlangan matn to'g'ridan-to'g'ri forma qiymati sifatida
            // yuborilardi, va OpenBudget buni haqiqiy raqam sifatida tanimay HTTP 400
            // bilan captcha'ni rad etardi (ovoz hech qachon hisoblanmasdi).
            const phoneInput = document.getElementById('phone');
            const prefilledPhone = "${cleanPhone}";
            if (phoneInput && prefilledPhone) {
              phoneInput.value = prefilledPhone;
              phoneInput.readOnly = true;
              localStorage.setItem('phone', prefilledPhone);
              // MUHIM: OpenBudget'ning o'z checkPhoneNumber() funksiyasi bu qiymatni
              // yana "99 065-26-51" kabi formatlab qo'yadi (faqat ko'rsatish uchun
              // mo'ljallangan) — shuning uchun forma jo'natilishidan TO'G'RIDAN-TO'G'RI
              // oldin qiymatni xom raqamga qaytarib qo'yamiz, aks holda OpenBudget'ga
              // yana formatlangan (probel/tiredagi) qiymat ketib, captcha rad etiladi.
              if (typeof checkPhoneNumber === 'function') checkPhoneNumber(phoneInput);
              const voteFormEl = document.getElementById('vote-form') || phoneInput.closest('form');
              if (voteFormEl) {
                voteFormEl.addEventListener('submit', function () {
                  phoneInput.value = prefilledPhone;
                }, true);
              }
            }

            // MUHIM (ILDIZ SABABI TOPILDI): OpenBudget'ning O'Z sahifasidagi skript
            // Enter/mobil klaviaturaning "Go" tugmasi bosilganda formani IKKI XIL
            // yo'l bilan yuboradi — (1) keydown handleri to'g'ridan-to'g'ri
            // forms[i].submit() chaqiradi, (2) forma o'zining "submit" hodisa
            // ichida yana e.target.submit() chaqiradi. Muammo shundaki, JS'da
            // formaning .submit() metodi TO'G'RIDAN-TO'G'RI chaqirilsa, brauzer
            // "submit" HODISASINI UMUMAN ISHGA TUSHIRMAYDI — shuning uchun oddiy
            // addEventListener('submit', ...) orqali qo'yilgan himoya (pastda)
            // shu yo'lni butunlay o'tkazib yuborardi. To'g'ri yechim — formaning
            // .submit() METODINI o'zini almashtirish: shunda uni kim va qanday
            // chaqirmasin (klaviatura Enter'i, tugma bosilishi, OpenBudget skripti)
            // — baribir faqat BIR MARTA haqiqiy yuborilishi kafolatlanadi.
            (function () {
              var origSubmit = HTMLFormElement.prototype.submit;
              HTMLFormElement.prototype.submit = function () {
                if (this.__obAlreadySubmitted) return;
                this.__obAlreadySubmitted = true;
                var submitBtn = this.querySelector('button[type="submit"], input[type="submit"]');
                if (submitBtn) submitBtn.disabled = true;
                return origSubmit.call(this);
              };
            })();
            document.querySelectorAll('form').forEach(function (formEl) {
              let alreadySubmitted = false;
              formEl.addEventListener('submit', function (e) {
                if (alreadySubmitted) {
                  e.preventDefault();
                  e.stopImmediatePropagation();
                  return false;
                }
                alreadySubmitted = true;
                const submitBtn = formEl.querySelector('button[type="submit"], input[type="submit"]');
                if (submitBtn) submitBtn.disabled = true;
              }, true);
            });

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
      let val: string;
      if (Array.isArray(v)) {
        val = String(v.filter(Boolean).pop() || '');
      } else if (typeof v === 'object' && v !== null) {
        val = JSON.stringify(v);
      } else {
        val = String(v ?? '');
      }
      params.set(k, val);
    }
    args.push('--data', params.toString());
    args.push('https://new.openbudget.uz/api/v2/vote/mvc/captcha');

    this.logger.log(`📦 [mvc/captcha POST] So'rov tanasi (request body): ${params.toString()}`);

    try {
      const { stdout } = await execCurlWithRetry(args, 2, `POST mvc/captcha (+${logPhone})`);
      const statusMatch690 = stdout.match(/HTTP\/(?:1\.[01]|2)\s+(\d{3})/g);
      const captchaStatusCode = statusMatch690 ? parseInt(statusMatch690[statusMatch690.length - 1].match(/\d{3}/)![0], 10) : 0;
      this.logger.log(`📤 [mvc/captcha POST] OpenBudget javobi: ${statusMatch690 ? statusMatch690[statusMatch690.length - 1] : "noma'lum"} | Phone: +${logPhone}`);

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
        const errorAlertMatch = stdout.match(/<div class="error-alert"[^>]*>([\s\S]*?)<\/div>/i);
        let openBudgetErrorText = errorAlertMatch ? errorAlertMatch[1].replace(/<[^>]+>/g, '').trim() : '';

        if (!openBudgetErrorText) {
          const cardPMatch = stdout.match(/<div class="card"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
          if (cardPMatch) openBudgetErrorText = cardPMatch[1].replace(/<[^>]+>/g, '').trim();
        }

        const displayErrorText = openBudgetErrorText || `Captcha tasdiqlanmadi. Iltimos, qaytadan urinib ko'ring.`;
        const lowerErr = displayErrorText.toLowerCase();

        const isPassportDuplicate = lowerErr.includes('allaqachon') || lowerErr.includes('ovoz berilgan') || lowerErr.includes('mavsum') || lowerErr.includes('bir marta');
        const isDailyLimit = lowerErr.includes('урунишлар сони') || lowerErr.includes('urinishlar soni') || lowerErr.includes('limit');
        const advice = isPassportDuplicate
          ? "\n\n💡 Boshqa yaqinlaringiz (boshqa pasport egasi) nomidagi telefon raqamidan ovoz bering."
          : isDailyLimit
            ? "\n\n💡 Bu raqam uchun bugungi urinishlar tugagan — ertaga yoki boshqa raqam bilan urinib ko'ring."
            : "";

        this.logger.warn(`⚠️ [mvc/captcha POST] OpenBudget CAPTCHA rad etildi: HTTP ${captchaStatusCode} | Phone: +${logPhone} | Sabab: "${displayErrorText}"`);

        (async () => {
          try {
            const tgId = String(body?.tg_id || body?.telegramId || '').trim();
            const botIdNum = parseInt(String(body?.botId || body?.bot_id || ''), 10);
            if (tgId && botIdNum) {
              const bot = await this.prisma.botInstance.findUnique({ where: { id: botIdNum } });
              if (bot?.token) {
                await axios.post(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
                  chat_id: tgId,
                  text: `⚠️ <b>OVOZ QABUL QILINMADI:</b>\n\n📱 Telefon: +998${logPhone.replace(/^998/, '')}\n📌 <b>Sabab:</b> ${displayErrorText}${advice}`,
                  parse_mode: 'HTML',
                }).catch(() => {});
              }
            }
          } catch {}
        })();

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
              <h2>Ovoz qabul qilinmadi!</h2>
              <p>${displayErrorText}${advice.replace(/\n\n💡\s*/, '<br><br>💡 ')}</p>
              <button onclick="if(window.Telegram && window.Telegram.WebApp) window.Telegram.WebApp.close(); else window.close();">Botga qaytish</button>
            </div>
            <script>if (window.Telegram && window.Telegram.WebApp) { window.Telegram.WebApp.ready(); window.Telegram.WebApp.expand(); }</script>
          </body></html>
        `);
      }

      const postedPhone = String(Array.isArray(body?.phoneNumber) ? (body.phoneNumber[body.phoneNumber.length - 1] || body.phoneNumber[0] || '') : (body?.phoneNumber || '')).replace(/[^0-9]/g, '');
      const postedTgId = String(body?.tg_id || body?.telegramId || '').trim();
      const postedBotId = String(body?.botId || body?.bot_id || '').trim();

      this.setProxyCookies(res, stdout, {
        VOTE_PHONE: postedPhone,
        VOTE_TG_ID: postedTgId,
        VOTE_BOT_ID: postedBotId,
      });

      const htmlStart = stdout.indexOf('<!DOCTYPE html>') !== -1 ? stdout.indexOf('<!DOCTYPE html>') : stdout.indexOf('<html');
      let bodyRaw = htmlStart !== -1 ? stdout.slice(htmlStart) : stdout;

      bodyRaw = bodyRaw.replace(/eval\s*\(\s*function\s*\([a-z,\s]+\)[\s\S]*?\.split\(['"][|]['"][\s\S]*?\)\s*\)/gi, '/* iframe blocker removed */');
      bodyRaw = bodyRaw.replace(/window\.location\.href\s*=\s*['"]https:\/\/openbudget\.uz['"]/gi, '/* redirect removed */');
      bodyRaw = bodyRaw.replace(/action="\/api\/v2\/vote\/mvc\/captcha"/g, 'action="/api/v2/vote/mvc/captcha"');
      bodyRaw = bodyRaw.replace(/action="\/api\/v2\/vote\/mvc\/verify"/g, 'action="/api/v2/vote/mvc/verify"');

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

        /* MUHIM: OpenBudget'ning o'z rasmi 345px bilan cheklangan (kichik,
           sichqoncha uchun mo'ljallangan). Mobil ekranda barmoq bilan aniq
           bosish qiyin bo'lgani uchun, rasmni ekran kengligiga qarab
           kattaroq ko'rsatamiz — koordinata hisob-kitobi (345x230 asl
           o'lchamga nisbatan) allaqachon istalgan ko'rsatilgan o'lchamga
           moslashadi, shuning uchun bu faqat ko'rinishni kattalashtiradi,
           yuborilgan koordinatalarga ta'sir qilmaydi. */
        .img-lazy, #imgLazy, #imageB {
          width: 100% !important;
          max-width: 480px !important;
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
              timerBox.innerHTML = '<div class="timer-bar-wrap"><div class="timer-bar-fill" id="timerFill"></div></div><div class="timer-label"><span>Rasm yangilanishi:</span><span id="timerSec">30 s</span></div>';
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

    // Takroriy-yuborish himoyasi (backend darajasida, aniq): bir xil telefon+kod
    // so'nggi 10 soniya ichida allaqachon OpenBudget'ga yuborilgan bo'lsa — bu
    // aniq bir xil urinishning takrori (frontend JS himoyasi ishlamay qolgan
    // holat), shuning uchun OpenBudget'ning haqiqiy serveriga IKKINCHI marta
    // so'rov YUBORILMAYDI (real urinishlar sonini behuda sarflamaslik va
    // ehtimoliy rate-limit/chalkashlikning oldini olish uchun).
    const otpValRaw = Array.isArray(body?.otpCode) ? body.otpCode[body.otpCode.length - 1] : body?.otpCode;
    const otpVal = String(otpValRaw ?? body?.code ?? '').trim();
    const dedupeKey = `${logPhone2}:${otpVal}`;
    const nowTs = Date.now();
    for (const [k, ts] of this.recentVerifyAttempts) {
      if (nowTs - ts > WebAppController.VERIFY_DEDUPE_TTL_MS) this.recentVerifyAttempts.delete(k);
    }
    if (logPhone2 && otpVal && this.recentVerifyAttempts.has(dedupeKey)) {
      this.logger.warn(`🔁 [mvc/verify POST] Takroriy so'rov aniqlandi (10s ichida bir xil kod) — OpenBudget'ga QAYTA YUBORILMADI. Phone: +${logPhone2}`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>So'rov qabul qilindi</title>
        <style>body{font-family:-apple-system,sans-serif;background:#f8fafc;margin:0;padding:20px;display:flex;align-items:center;justify-content:center;min-height:90vh;}
        .card{background:#fff;border-radius:20px;padding:26px 20px;text-align:center;max-width:360px;box-shadow:0 10px 25px rgba(0,0,0,.06);border:1px solid #e2e8f0;}
        h2{color:#0f172a;margin:0 0 8px;font-size:19px;} p{color:#475569;font-size:14px;line-height:1.5;margin:0;}</style></head>
        <body><div class="card"><h2>⏳ So'rovingiz allaqachon qabul qilindi</h2><p>Iltimos, kuting — qayta yubormang. Natija tez orada botda ko'rinadi.</p></div></body></html>
      `);
    }
    if (logPhone2 && otpVal) this.recentVerifyAttempts.set(dedupeKey, nowTs);

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

    const cookiePhoneMatch = (clientCookies || '').match(/VOTE_PHONE=([0-9]+)/);
    const rawDigits = String(
      Array.isArray(body?.phoneNumber)
        ? (body.phoneNumber[body.phoneNumber.length - 1] || body.phoneNumber[0] || '')
        : (body?.phoneNumber || body?.phone || (cookiePhoneMatch ? cookiePhoneMatch[1] : ''))
    ).replace(/[^0-9]/g, '');
    const clean12 = rawDigits.length >= 9 ? (rawDigits.length === 9 ? `998${rawDigits}` : (rawDigits.startsWith('998') ? rawDigits : `998${rawDigits.slice(-9)}`)) : '';
    const clean9 = clean12.slice(-9);

    const grToken = String(Array.isArray(body?.grToken) ? body.grToken[0] : (body?.grToken ?? '')).trim();

    const params = new URLSearchParams();
    if (clean9) params.set('phoneNumber', clean9);
    params.set('otpCode', otpVal);
    params.set('grToken', grToken);
    args.push('--data', params.toString());
    args.push('https://new.openbudget.uz/api/v2/vote/mvc/verify');

    this.logger.log(`📦 [mvc/verify POST] So'rov tanasi (request body): ${params.toString()}`);

    try {
      const { stdout } = await execCurlWithRetry(args, 2, `POST mvc/verify (+${clean12 || logPhone2})`);

      this.setProxyCookies(res, stdout);

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

      const hasZeroContentLength = /content-length:\s*0\s*(\r?\n|$)/i.test(stdout);
      if (hasZeroContentLength) {
        bodyRaw = '';
      }


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

      const isAlreadyVotedPhone = lowerBody.includes('рақам орқали овоз берилган') || lowerBody.includes('ushbu raqam') || lowerBody.includes('raqam orqali');
      const isAlreadyVotedCitizen = lowerBody.includes('фуқаро') || lowerBody.includes('паспорт') || lowerBody.includes('nomiga ovoz berilgan') || lowerBody.includes('fuqaro');
      const isExpiredSms = lowerBody.includes('муддати тугаган') || lowerBody.includes('eskirgan') || lowerBody.includes('vaqti');
      const isLimitExceeded = lowerBody.includes('уринишлар сони тугади') || lowerBody.includes('limit') || lowerBody.includes('urinishlar soni');

      const isRealSuccess = (lastStatusCode === 200 || lastStatusCode === 201) && !isJsonError && !hasErrorText && !isAlreadyVotedPhone && !isAlreadyVotedCitizen && !isExpiredSms && !isLimitExceeded;
      this.logger.log(`🔎 [mvc/verify POST] Natija tahlili: isRealSuccess=${isRealSuccess} lastStatusCode=${lastStatusCode} isAlreadyVoted=${isAlreadyVotedPhone || isAlreadyVotedCitizen} | Phone: +${logPhone2}`);

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

      if (isRealSuccess) {
        try {
          this.logger.log(`🎉 [OpenBudget Verify REAL SUCCESS] Phone: +${clean12} | HTTP Status: ${lastStatusCode}`);

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

            const createdVoteId = await withPhoneLock(clean12 || clean9, async () => {
              const existingVote = clean12 ? await this.prisma.vote.findFirst({
                where: {
                  OR: [
                    { phone: clean12 },
                    { phone: clean9 },
                  ],
                  status: { in: ['VERIFIED', 'PENDING_VERIFICATION'] },
                },
              }) : null;

              if (existingVote) return null;

              const userAgent = user.agentId ? await this.prisma.agent.findUnique({ where: { id: user.agentId } }) : null;
              const agentReward = userAgent ? (userAgent.rewardPerVote || 5000) : 0;

              const newVote = await this.prisma.vote.create({
                data: {
                  userId: user.id,
                  botInstanceId: activeBot?.id || 6,
                  phone: clean12 || (user.phone || '998000000000'),
                  status: 'PENDING_VERIFICATION',
                  rewardAmount: voteReward,
                  agentId: user.agentId || null,
                  agentReward: agentReward,
                  smsCode: otpVal || String(body?.code || 'WEB'),
                },
              }).catch(() => null);

              return newVote?.id ?? null;
            });
            const wasCreated = createdVoteId !== null;

            if (wasCreated) {
              this.logger.log(`⏳ [Vote Submitted - Pending Verification] User ID: ${user.id} | Telegram: ${user.telegramId} | Phone: +${clean12}`);

              // Orqa fonda reyestr tekshiruvini ishga tushirish (avto-tasdiqlash)
              if (createdVoteId) {
                this.voteAutoApproverService.checkVoteNow(createdVoteId).catch(() => {});
              }

              // Telegram Bot orqali to'g'ri o'zbekcha qabul qilindi xabarini jo'natish:
              if (activeBot?.token) {
                const tgUrl = `https://api.telegram.org/bot${activeBot.token}/sendMessage`;
                const formattedPhoneForMsg = `998 ${clean9 ? `${clean9.slice(0,2)} ${clean9.slice(2,5)}-${clean9.slice(5,7)}-${clean9.slice(7,9)}` : '***'}`;
                const text = BOT_MESSAGES.VOTE_SUBMITTED_PENDING(formattedPhoneForMsg, voteReward, mahallaName);

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
                  <p>Ovozingiz tizim tomonidan qabul qilindi. OpenBudget rasmiy reyestridan o'tgandan so'ng balansingizga mablag' qo'shiladi va tasdiqlash xabari yuboriladi.</p>
                  <button onclick="if(window.Telegram && window.Telegram.WebApp) window.Telegram.WebApp.close(); else window.close();">Botga qaytish</button>
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
          }
        } catch (e: any) {
          this.logger.error(`Ovozni saqlashda xatolik: ${e.message}`);
        }
      }

      // Agar xato bo'lsa (isRealSuccess === false) - bot foydalanuvchisiga va Mini App'ga xabar berish:
      const isWrongSms = !isAlreadyVotedPhone && !isAlreadyVotedCitizen && !isLimitExceeded && (lowerBody.includes('нотўғри') || lowerBody.includes('noto\'g\'ri') || lastStatusCode === 400 || lastStatusCode === 500);

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
    } catch (err: any) {
      this.logger.error(`❌ [mvc/verify POST] Xatolik (barcha qayta urinishlardan keyin ham): ${err.message} | Phone: +${logPhone2}`);
      return res.status(500).send(`<h3>SMS tasdiqlashda xatolik: ${err.message}</h3>`);
    }
  }
}
