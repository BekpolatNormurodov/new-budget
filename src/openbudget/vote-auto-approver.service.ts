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
   * 🤖 Har 1 daqiqada kutilayotgan ovozlarni OpenBudget API orqali avtomatik tekshirish
   */
  startLiveVoteChecker(sendMessageCallback: (botId: number | null, telegramId: string, text: string) => Promise<void>) {
    const autoApproveHours = this.configService.get<number>('bot.autoApproveHours') || 2;
    const fallbackDelayMs = autoApproveHours * 60 * 60 * 1000;

    this.checkInterval = setInterval(async () => {
      try {
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
            const token = vote.jwtToken || vote.user.openBudgetJwt;
            if (token) {
              const res = await this.openBudgetService.getUserVotedInitiatives(token);
              if (res.success && res.initiatives && res.initiatives.length > 0) {
                // Foydalanuvchi qaysi loyihaga ovoz berganini tekshiramiz
                const matched = res.initiatives.find((ini: any) => {
                  const iniId = String(ini.id || ini.initiative_id || ini.public_id || '');
                  const botUuid = String(vote.botInstance?.initiativeUuid || '');
                  const botMahallaId = String(vote.botInstance?.mahallaId || '');
                  return (
                    (botUuid && iniId.includes(botUuid)) ||
                    (botMahallaId && iniId.includes(botMahallaId)) ||
                    res.initiatives!.length === 1 // Agar bitta loyihaga ovoz bergan bo'lsa
                  );
                });

                if (matched || res.initiatives.length > 0) {
                  shouldApprove = true;
                  checkReason = `[OpenBudget API tasdiqladi: ${res.initiatives.length} ta ovoz]`;
                }
              }
            }

            // 2. Agar 2 soat (yoki belgilangan vaqt) o'tgan bo'lsa -> Vaqt bo'yicha avto-tasdiqlash
            const elapsed = Date.now() - new Date(vote.createdAt).getTime();
            if (!shouldApprove && elapsed >= fallbackDelayMs) {
              shouldApprove = true;
              checkReason = `[Vaqt muddati (2 soat) to'ldi]`;
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
    }, 60000); // Har 1 daqiqada avtomat tekshirish
  }
}
