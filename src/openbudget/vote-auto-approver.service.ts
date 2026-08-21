import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenBudgetService } from '../openbudget/openbudget.service';
import { WalletService } from '../wallet/wallet.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class VoteAutoApproverService {
  private readonly logger = new Logger(VoteAutoApproverService.name);
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly openBudgetService: OpenBudgetService,
    private readonly walletService: WalletService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 🤖 Har 30 soniyada kutilayotgan ovozlarni OpenBudget API va vaqt bo'yicha avtomatik tekshirish
   */
  startLiveVoteChecker(sendMessageCallback: (botId: number | null, telegramId: string, text: string) => Promise<void>) {
    const runCheck = async () => {
      try {
        const autoApproveHours = this.configService.get<number>('bot.autoApproveHours') || 2;
        const fallbackDelayMs = autoApproveHours * 60 * 60 * 1000;

        const pendingVotes = await this.prisma.vote.findMany({
          where: { status: 'PENDING_VERIFICATION' },
          include: { user: true, botInstance: true },
          take: 50,
        });

        if (pendingVotes.length === 0) return;

        for (const vote of pendingVotes) {
          try {
            let shouldApprove = false;
            let checkReason = '';

            // 1. Agar foydalanuvchida OpenBudget JWT Token bo'lsa -> OpenBudget API dan tekshirish
            const token = vote.jwtToken || vote.user?.openBudgetJwt;
            if (token) {
              const res = await this.openBudgetService.getUserVotedInitiatives(token);
              if (res.success && res.initiatives && res.initiatives.length > 0) {
                shouldApprove = true;
                checkReason = `[OpenBudget API tasdiqladi: ${res.initiatives.length} ta ovoz]`;
              }
            }

            // 2. Agar 2 soat (yoki belgilangan vaqt) o'tgan bo'lsa -> Vaqt bo'yicha avto-tasdiqlash
            const elapsed = Date.now() - new Date(vote.createdAt).getTime();
            if (!shouldApprove && elapsed >= fallbackDelayMs) {
              shouldApprove = true;
              checkReason = `[Vaqt muddati (${autoApproveHours} soat) to'ldi]`;
            }

            // 3. Tasdiqlash va hisobga pul o'tkazish
            if (shouldApprove) {
              const creditRes = await this.walletService.verifyVoteAndCredit(vote.id);
              if (!creditRes.alreadyVerified) {
                this.logger.log(`✅ [Auto-Approver] Ovoz #${vote.id} (+${vote.phone}) avtomatik tasdiqlandi! Sabab: ${checkReason}`);
                
                const msg = `🎉 Tabriklaymiz! Sizning +${vote.phone} raqam orqali bergan ovozingiz Ochiq Budjet tizimi tomonidan muvaffaqiyatli tasdiqlandi!\n\n` +
                  `💰 Hisobingizga +${creditRes.rewardAmount.toLocaleString('uz-UZ')} so'm qo'shildi!\n` +
                  `💳 Hozirgi balansingiz: ${creditRes.user.balance.toLocaleString('uz-UZ')} so'm\n\n` +
                  `🚀 Do'stlaringizni taklif qiling va har bir do'stingiz uchun +5 000 so'mdan bonus oling!`;

                await sendMessageCallback(vote.botInstanceId, vote.user.telegramId, msg).catch(() => {});
              }
            }
          } catch (voteErr: any) {
            this.logger.warn(`Ovoz #${vote.id} tekshiruvida xatolik: ${voteErr.message}`);
          }
        }
      } catch (err: any) {
        this.logger.error(`LiveVoteChecker xatoligi: ${err.message}`);
      }
    };

    // Server ko'tarilishi bilan darhol 1-marta tekshirish
    setTimeout(() => {
      runCheck().catch(() => {});
    }, 2000);

    // Keyin har 30 soniyada doimiy avto-tekshirish
    this.checkInterval = setInterval(runCheck, 30000);
  }
}
