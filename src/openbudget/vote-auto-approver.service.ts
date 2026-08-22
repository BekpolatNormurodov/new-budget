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
            let shouldReject = false;
            let rejectReason = '';
            let checkReason = '';

            const botRecord = vote.botInstance;
            const token = vote.jwtToken || vote.user?.openBudgetJwt;

            // 1. OPENBUDGET RASMIY API TEKSHIRUVI (Har 30 soniyada jonli tekshiruv)
            if (token) {
              const res = await this.openBudgetService.getUserVotedInitiatives(token);
              if (res.success && Array.isArray(res.initiatives)) {
                if (res.initiatives.length > 0) {
                  // Foydalanuvchi biror mahallaga ovoz bergan!
                  // Endi tekshiramiz: Aynan bizning botdagi mahallamizmi yoki boshqa mahalla?
                  let matched = false;
                  let votedQuarterTitle = '';

                  for (const init of res.initiatives) {
                    votedQuarterTitle = init.quarter_title || init.title || '';
                    const initUuid = init.id;
                    const publicId = init.public_id;

                    // Match formula:
                    // 1. UUID mosligi
                    // 2. 12 xonali Mahalla ID mosligi
                    // 3. Mahalla nomi mosligi (qisman yoki to'liq)
                    const isUuidMatch = botRecord?.initiativeUuid && initUuid && botRecord.initiativeUuid.toLowerCase() === initUuid.toLowerCase();
                    const isPublicIdMatch = botRecord?.mahallaId && publicId && String(botRecord.mahallaId) === String(publicId);
                    const isNameMatch = botRecord?.mahallaName && votedQuarterTitle && (
                      botRecord.mahallaName.toLowerCase().includes(votedQuarterTitle.toLowerCase()) ||
                      votedQuarterTitle.toLowerCase().includes(botRecord.mahallaName.toLowerCase().replace(/mfy|mahalla/g, '').trim())
                    );

                    if (isUuidMatch || isPublicIdMatch || isNameMatch || !botRecord) {
                      matched = true;
                      break;
                    }
                  }

                  if (matched) {
                    shouldApprove = true;
                    checkReason = `[OpenBudget API 100% tasdiqladi: ${votedQuarterTitle}]`;
                  } else {
                    // Boshqa mahallaga ovoz berilgan!
                    shouldReject = true;
                    rejectReason = `Siz boshqa mahallaga (${votedQuarterTitle || 'noma\'lum'}) ovoz bergansiz! Ushbu bot faqat ${botRecord?.mahallaName || 'ushbu mahalla'} uchun mo'ljallangan.`;
                  }
                }
              }
            }

            // 2. RAD ETISH HOLATI (Boshqa mahallaga ovoz berilgan bo'lsa)
            if (shouldReject) {
              await this.prisma.vote.update({
                where: { id: vote.id },
                data: {
                  status: 'REJECTED',
                  errorMessage: rejectReason,
                },
              });
              this.logger.warn(`❌ [Auto-Approver] Ovoz #${vote.id} (+${vote.phone}) rad etildi: ${rejectReason}`);

              const rejectMsg = `⚠️ <b>Ovoz qabul qilinmadi!</b>\n\n` +
                `📌 <b>Sabab:</b> ${rejectReason}\n\n` +
                `Siz boshqa yaqinlaringiz raqamidan ushbu mahalla foydasiga ovoz berib pul ishlashingiz mumkin!`;

              await sendMessageCallback(vote.botInstanceId, vote.user.telegramId, rejectMsg).catch(() => {});
              continue;
            }

            // 3. QAT'IY QOIDA: Faqat OpenBudget API tasdiqlagan ovozlargina qabul qilinadi!
            // Agar OpenBudget'da ovoz hali ko'rinmasa, ovoz PENDING_VERIFICATION holatida qoladi va tekshirilishda davom etadi.

            // 4. TASDIQLASH VA HISOBGA PUL O'TKAZISH
            if (shouldApprove) {
              const creditRes = await this.walletService.verifyVoteAndCredit(vote.id);
              if (!creditRes.alreadyVerified) {
                this.logger.log(`✅ [Auto-Approver] Ovoz #${vote.id} (+${vote.phone}) tasdiqlandi! Sabab: ${checkReason}`);

                const msg = `🎉 <b>Tabriklaymiz!</b> Sizning +${vote.phone} raqam orqali bergan ovozingiz Ochiq Budjet tizimi tomonidan muvaffaqiyatli tasdiqlandi!\n\n` +
                  `💰 <b>Hisobingizga:</b> +${creditRes.rewardAmount.toLocaleString('uz-UZ')} so'm qo'shildi!\n` +
                  `💳 <b>Hozirgi balansingiz:</b> ${creditRes.user.balance.toLocaleString('uz-UZ')} so'm\n\n` +
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
