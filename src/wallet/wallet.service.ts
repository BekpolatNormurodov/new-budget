import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Foydalanuvchi referal havola orqali ro'yxatdan o'tganda taklifchiga bonus yozish (5 000 so'm)
   */
  async creditReferralJoinBonus(referrerId: number, refereeId: number) {
    const refBonus = this.configService.get<number>('bot.referralBonus') || 5000;

    const existingReward = await this.prisma.referralReward.findFirst({
      where: { referrerId, refereeId, reason: 'SIGNUP_BONUS' },
    });

    if (existingReward) return null;

    const [updatedReferrer, reward] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: referrerId },
        data: {
          balance: { increment: refBonus },
          totalEarned: { increment: refBonus },
        },
      }),
      this.prisma.referralReward.create({
        data: {
          referrerId,
          refereeId,
          amount: refBonus,
          reason: 'SIGNUP_BONUS',
        },
      }),
    ]);

    this.logger.log(`Taklifchi #${referrerId} ga yangi a'zo #${refereeId} uchun +${refBonus} so'm referal bonusi yozildi`);
    return { updatedReferrer, reward, refBonus };
  }

  /**
   * Foydalanuvchiga to'g'ridan-to'g'ri ovoz mukofotini yozish
   */
  async creditVoteReward(userId: number, customReward?: number) {
    const defaultReward = this.configService.get<number>('bot.voteReward') || 30000;
    const reward = customReward !== undefined ? customReward : defaultReward;
    const refBonus = this.configService.get<number>('bot.referralBonus') || 5000;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        balance: { increment: reward },
        totalEarned: { increment: reward },
        totalVotes: { increment: 1 },
      },
      include: { referrer: true },
    });

    return { user, reward, refBonus };
  }

  /**
   * Ovoz tasdiqlanganda (2-24 soat ichida yoki avtomat/admin tomonidan) foydalanuvchiga 30 000 so'm yozish
   */
  async verifyVoteAndCredit(voteId: number) {
    const vote = await this.prisma.vote.findUnique({
      where: { id: voteId },
      include: { user: { include: { referrer: true } }, initiative: true },
    });

    if (!vote) throw new Error('Ovoz topilmadi');
    if (vote.status === 'VERIFIED') return { vote, user: vote.user, alreadyVerified: true };

    const rewardAmount = vote.rewardAmount || this.configService.get<number>('bot.voteReward') || 30000;

    const [updatedVote, updatedUser] = await this.prisma.$transaction([
      this.prisma.vote.update({
        where: { id: voteId },
        data: {
          status: 'VERIFIED',
          completedAt: new Date(),
        },
      }),
      this.prisma.user.update({
        where: { id: vote.userId },
        data: {
          balance: { increment: rewardAmount },
          totalEarned: { increment: rewardAmount },
          totalVotes: { increment: 1 },
        },
      }),
    ]);

    // Agent hisobiga ovoz va komissiya yozish
    if (vote.agentId && vote.agentReward > 0) {
      await this.prisma.agent.update({
        where: { id: vote.agentId },
        data: {
          totalVotes: { increment: 1 },
          totalEarned: { increment: vote.agentReward },
          balance: { increment: vote.agentReward },
        },
      }).catch((err) => {
        this.logger.warn(`Agent #${vote.agentId} ga komissiya yozishda xatolik: ${err.message}`);
      });
      this.logger.log(`🤝 Agent #${vote.agentId} ga ovoz #${voteId} uchun +${vote.agentReward} so'm komissiya yozildi.`);
    }

    // Initiative hisoblagichini oshirish
    if (vote.initiativeId) {
      await this.prisma.initiative.update({
        where: { id: vote.initiativeId },
        data: { currentVotes: { increment: 1 } },
      }).catch(() => {});
    }

    this.logger.log(`✅ Ovoz #${voteId} tasdiqlandi. Foydalanuvchi #${vote.userId} ga +${rewardAmount} so'm yozildi.`);
    return { vote: updatedVote, user: updatedUser, rewardAmount, alreadyVerified: false };
  }

  /**
   * Kutilayotgan barcha ovozlarni olish
   */
  async getPendingVotes() {
    return this.prisma.vote.findMany({
      where: { status: 'PENDING_VERIFICATION' },
      include: { user: true, initiative: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Pul yechish so'rovini yaratish
   */
  async createWithdrawalRequest(params: {
    userId: number;
    amount: number;
    paymentMethod: 'UZCARD' | 'HUMO' | 'PAYNET';
    accountDetails: string;
    cardHolder?: string;
  }) {
    const { userId, amount, paymentMethod, accountDetails, cardHolder } = params;
    const minWithdrawal = this.configService.get<number>('bot.minWithdrawal') || 10000;

    if (amount < minWithdrawal) {
      throw new Error(`Minimal pul yechish summasi: ${minWithdrawal.toLocaleString('uz-UZ')} so'm.`);
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('Foydalanuvchi topilmadi.');
    }

    if (user.balance < amount) {
      throw new Error(`Hisobingizda mablag' yetarli emas! Mavjud balans: ${user.balance.toLocaleString('uz-UZ')} so'm.`);
    }

    // Balansdan yechish va so'rov yaratish
    const [updatedUser, withdrawal] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          balance: { decrement: amount },
          totalWithdrawn: { increment: amount },
        },
      }),
      this.prisma.withdrawal.create({
        data: {
          userId,
          amount,
          paymentMethod,
          accountDetails: accountDetails.replace(/\s+/g, ''),
          cardHolder,
          status: 'PENDING',
        },
      }),
    ]);

    return { updatedUser, withdrawal };
  }

  /**
   * Pul yechish so'rovini admin tomonidan tasdiqlash
   */
  async approveWithdrawal(withdrawalId: number, adminNote?: string, receiptUrl?: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
      include: { user: true },
    });

    if (!withdrawal) {
      throw new Error('So\'rov topilmadi');
    }

    if (withdrawal.status !== 'PENDING') {
      throw new Error(`Ushbu so'rov allaqachon ${withdrawal.status} holatida!`);
    }

    const updated = await this.prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: {
        status: 'APPROVED',
        adminNote: adminNote || 'Muvaffaqiyatli to\'landi',
        receiptUrl: receiptUrl || withdrawal.receiptUrl,
        processedAt: new Date(),
      },
      include: { user: true },
    });

    return updated;
  }

  /**
   * Pul yechish so'rovini rad etish va mablag'ni balansga qaytarish
   */
  async rejectWithdrawal(withdrawalId: number, adminNote?: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
      include: { user: true },
    });

    if (!withdrawal) {
      throw new Error('So\'rov topilmadi');
    }

    if (withdrawal.status !== 'PENDING') {
      throw new Error(`Ushbu so'rov allaqachon ${withdrawal.status} holatida!`);
    }

    // Mablag'ni foydalanuvchiga qaytarish
    const [updated, user] = await this.prisma.$transaction([
      this.prisma.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: 'REJECTED',
          adminNote: adminNote || 'Admin tomonidan rad etildi',
          processedAt: new Date(),
        },
      }),
      this.prisma.user.update({
        where: { id: withdrawal.userId },
        data: {
          balance: { increment: withdrawal.amount },
          totalWithdrawn: { decrement: withdrawal.amount },
        },
      }),
    ]);

    return { updated, user };
  }

  /**
   * Foydalanuvchi statistikasini olish
   */
  async getUserStats(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        referrals: { select: { id: true, firstName: true, createdAt: true, totalVotes: true } },
        votes: { orderBy: { createdAt: 'desc' }, take: 10 },
        withdrawals: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    return user;
  }
}
