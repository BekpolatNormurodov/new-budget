import { Controller, Get, Post, Body, Query, Headers, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenBudgetService } from '../openbudget/openbudget.service';
import { WalletService } from '../wallet/wallet.service';
import { ConfigService } from '@nestjs/config';

@Controller('api/app')
export class WebAppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openBudgetService: OpenBudgetService,
    private readonly walletService: WalletService,
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
}
