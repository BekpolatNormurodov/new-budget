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
   * 🤖 Har 15 minutda kutilayotgan ovozlarni OpenBudget API va vaqt bo'yicha avtomatik tekshirish
   */
  startLiveVoteChecker(sendMessageCallback: (botId: number | null, telegramId: string, text: string) => Promise<void>) {
    const runCheck = async () => {
      try {
        const pendingVotes = await this.prisma.vote.findMany({
          where: { status: 'PENDING_VERIFICATION' },
          include: { user: true, botInstance: true },
          take: 100,
        });

        if (pendingVotes.length === 0) return;
        this.logger.log(`🔍 [Auto-Approver 15-Min Sync] ${pendingVotes.length} ta kutilayotgan ovoz tekshirilmoqda...`);

        for (const vote of pendingVotes) {
          try {
            let shouldApprove = false;
            let shouldReject = false;
            let rejectReason = '';
            let checkReason = '';

            const botRecord = vote.botInstance;
            const token = vote.jwtToken || vote.user?.openBudgetJwt;

            // 1. OPENBUDGET RASMIY API TEKSHIRUVI
            if (token) {
              const res = await this.openBudgetService.getUserVotedInitiatives(token);
              if (res.success && Array.isArray(res.initiatives)) {
                if (res.initiatives.length > 0) {
                  let matched = false;
                  let votedQuarterTitle = '';

                  for (const init of res.initiatives) {
                    votedQuarterTitle = init.quarter_title || init.title || '';
                    const initUuid = init.id;
                    const publicId = init.public_id;

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
                    shouldReject = true;
                    rejectReason = `Siz boshqa mahallaga (${votedQuarterTitle || 'noma\'lum'}) ovoz bergansiz! Ushbu bot faqat ${botRecord?.mahallaName || 'ushbu mahalla'} uchun mo'ljallangan.`;
                  }
                }
              }
            }

            // 1.5. RASMIY OCHIQ BUDJET REYESTRIDAN TEKSHIRISH (Phone suffix & Timestamp strictly [-2 min : +2 min])
            if (!shouldApprove && !shouldReject && botRecord?.initiativeUuid) {
              try {
                const offVotes = await this.openBudgetService.fetchOfficialInitiativeVotesList(botRecord.initiativeUuid, 0);
                if (offVotes.success && Array.isArray(offVotes.content) && offVotes.content.length > 0) {
                  const cleanPhone = vote.phone.replace(/\D/g, '');
                  const suffix2 = cleanPhone.slice(-2);
                  const suffix4 = cleanPhone.slice(-4);
                  const voteTs = new Date(vote.createdAt).getTime();

                  const matchedInRegistry = offVotes.content.find((item: any) => {
                    const itemPhone = (item.phoneNumber || '').replace(/\D/g, '');
                    const isPhoneMatch = itemPhone.endsWith(suffix4) || itemPhone.endsWith(suffix2);
                    if (!isPhoneMatch) return false;

                    if (item.voteDate) {
                      // OpenBudget voteDate Tashkent vaqtida keladi ("YYYY-MM-DD HH:mm:ss")
                      const formattedDateStr = item.voteDate.includes('+')
                        ? item.voteDate
                        : item.voteDate.replace(' ', 'T') + '+05:00';
                      const itemTs = new Date(formattedDateStr).getTime();
                      const diffMs = Math.abs(voteTs - itemTs);

                      // Qat'iy chegaralangan tekshiruv: faqat [-2 minut : +2 minut] darchasida (120 000 ms)
                      const TWO_MINUTES_MS = 2 * 60 * 1000;
                      return !isNaN(itemTs) && diffMs <= TWO_MINUTES_MS;
                    }
                    return false;
                  });

                  if (matchedInRegistry) {
                    shouldApprove = true;
                    checkReason = `[OpenBudget Rasmiy Reyestridan tasdiqlandi (Aniq [-2m:+2m] vaqt mosligi): ${matchedInRegistry.phoneNumber} (${matchedInRegistry.voteDate})]`;
                  }
                }
              } catch (regErr: any) {
                this.logger.debug(`Registry match error: ${regErr.message}`);
              }
            }

            // 2. RAD ETISH HOLATI
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

            // 3. TASDIQLASH VA HISOBGA PUL O'TKAZISH
            if (shouldApprove) {
              const creditRes = await this.walletService.verifyVoteAndCredit(vote.id);
              if (!creditRes.alreadyVerified) {
                this.logger.log(`✅ [Auto-Approver] Ovoz #${vote.id} (+${vote.phone}) tasdiqlandi! Sabab: ${checkReason}`);

                const msg = `✅ <b>OVOZINGIZ RASMAN TASDIQLANDI!</b>\n\n` +
                  `📱 <b>Telefon:</b> +${vote.phone}\n` +
                  `💰 <b>Hisobingizga:</b> +${creditRes.rewardAmount.toLocaleString('uz-UZ')} so'm o'tkazildi!\n` +
                  `💳 <b>Yangi balansingiz:</b> ${creditRes.user.balance.toLocaleString('uz-UZ')} so'm\n\n` +
                  `🚀 Do'stlaringizni taklif qiling va har bir do'stingiz uchun bonus oling!`;

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

      // Har 15 minutlik siklda va startupda OpenBudget rasmiy saytidagi umumiy ovozlarni ham yangilab olish
      try {
        await this.openBudgetService.syncAllBotVotes();
      } catch (syncErr: any) {
        this.logger.warn(`syncAllBotVotes xatoligi: ${syncErr.message}`);
      }
    };

    // Server ko'tarilishi bilan 5 soniyadan so'ng 1-marta tekshirish va to'liq sinxronlash
    setTimeout(() => {
      runCheck().catch(() => {});
    }, 5000);

    // Keyin har 15 minutda (15 * 60 * 1000 ms) fon rejimida tekshirish
    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
    this.checkInterval = setInterval(runCheck, FIFTEEN_MINUTES_MS);
    this.logger.log(`🕒 [Auto-Approver] Ovozlar va rasmiy hisoblar har 15 minutda bir marta tekshiriladi.`);
  }
}
