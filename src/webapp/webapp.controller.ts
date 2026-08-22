import { Controller, Get, Post, Body, Query, Headers, Res, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenBudgetService } from '../openbudget/openbudget.service';
import { WalletService } from '../wallet/wallet.service';
import { ProxyManagerService } from '../proxy/proxy-manager.service';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

@Controller()
export class WebAppController {
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
   * 🗳 Rasmiy OpenBudget Captcha sahifasini to'g'ridan-to'g'ri ko'rsatish (GET /captcha)
   */
  @Get('/captcha')
  async getCaptchaPage(
    @Query('initiativeUuid') initiativeUuidQuery?: string,
    @Query('botId') botIdQuery?: string,
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
    args.push(`https://openbudget.uz/api/v2/vote/mvc/captcha/${initUuid}`);

    try {
      const { stdout } = await execFileAsync('curl', args, { maxBuffer: 10 * 1024 * 1024 });

      // Cookie larni mijozga uzatish
      const cookieMatches = stdout.match(/set-cookie:\s*([^\r\n]+)/gi) || [];
      for (const c of cookieMatches) {
        const val = c.replace(/^set-cookie:\s*/i, '');
        res.setHeader('Set-Cookie', val);
      }

      const htmlStart = stdout.indexOf('<!DOCTYPE html>') !== -1 ? stdout.indexOf('<!DOCTYPE html>') : stdout.indexOf('<html');
      let bodyRaw = htmlStart !== -1 ? stdout.slice(htmlStart) : stdout;

      // OpenBudget ichki form action manzillarini bizning proxy endpointga moslash
      bodyRaw = bodyRaw.replace(/action="\/api\/v2\/vote\/mvc\/captcha"/g, 'action="/api/v2/vote/mvc/captcha"');
      bodyRaw = bodyRaw.replace(/action="\/api\/v2\/vote\/mvc\/verify"/g, 'action="/api/v2/vote/mvc/verify"');

      // Agar ichki iframeda ishlasa, iframeni bloklamasligi uchun eval tekshiruvini zararsizlantirish
      bodyRaw = bodyRaw.replace(/window\.location\.href\s*=\s*['"]https:\/\/openbudget\.uz['"]/g, 'console.log("In-app captcha loaded")');

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(bodyRaw);
    } catch (err: any) {
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
    args.push('-H', 'Origin: https://openbudget.uz');
    args.push('-H', 'Referer: https://openbudget.uz/api/v2/vote/mvc/captcha');

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body || {})) {
      params.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    args.push('--data', params.toString());
    args.push('https://openbudget.uz/api/v2/vote/mvc/captcha');

    try {
      const { stdout } = await execFileAsync('curl', args, { maxBuffer: 10 * 1024 * 1024 });

      const cookieMatches = stdout.match(/set-cookie:\s*([^\r\n]+)/gi) || [];
      for (const c of cookieMatches) {
        const val = c.replace(/^set-cookie:\s*/i, '');
        res.setHeader('Set-Cookie', val);
      }

      const htmlStart = stdout.indexOf('<!DOCTYPE html>') !== -1 ? stdout.indexOf('<!DOCTYPE html>') : stdout.indexOf('<html');
      let bodyRaw = htmlStart !== -1 ? stdout.slice(htmlStart) : stdout;

      bodyRaw = bodyRaw.replace(/action="\/api\/v2\/vote\/mvc\/captcha"/g, 'action="/api/v2/vote/mvc/captcha"');
      bodyRaw = bodyRaw.replace(/action="\/api\/v2\/vote\/mvc\/verify"/g, 'action="/api/v2/vote/mvc/verify"');
      bodyRaw = bodyRaw.replace(/window\.location\.href\s*=\s*['"]https:\/\/openbudget\.uz['"]/g, 'console.log("In-app captcha loaded")');

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(bodyRaw);
    } catch (err: any) {
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
    args.push('-H', 'Origin: https://openbudget.uz');
    args.push('-H', 'Referer: https://openbudget.uz/api/v2/vote/mvc/captcha');

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body || {})) {
      params.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    args.push('--data', params.toString());
    args.push('https://openbudget.uz/api/v2/vote/mvc/verify');

    try {
      const { stdout } = await execFileAsync('curl', args, { maxBuffer: 10 * 1024 * 1024 });

      const cookieMatches = stdout.match(/set-cookie:\s*([^\r\n]+)/gi) || [];
      for (const c of cookieMatches) {
        const val = c.replace(/^set-cookie:\s*/i, '');
        res.setHeader('Set-Cookie', val);
      }

      const htmlStart = stdout.indexOf('<!DOCTYPE html>') !== -1 ? stdout.indexOf('<!DOCTYPE html>') : stdout.indexOf('<html');
      let bodyRaw = htmlStart !== -1 ? stdout.slice(htmlStart) : stdout;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(bodyRaw);
    } catch (err: any) {
      return res.status(500).send(`<h3>SMS tasdiqlashda xatolik: ${err.message}</h3>`);
    }
  }
}
