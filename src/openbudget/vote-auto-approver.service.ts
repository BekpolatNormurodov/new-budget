import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenBudgetService } from '../openbudget/openbudget.service';
import { WalletService } from '../wallet/wallet.service';
import { ConfigService } from '@nestjs/config';
import { BOT_MESSAGES } from '../bot/bot.constants';

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
            //
            // MUHIM: avval bu yerda telefon raqamining oxirgi FAQAT 2 ta raqami
            // (`suffix2`) ham mos deb hisoblanardi — bu juda zaif mezon edi: boshqa
            // biror odamning ovozi tasodifan oxirgi 2 raqami va vaqt oynasi mos
            // kelib qolsa, bizning foydalanuvchimiz HAQIQATDA ovoz bermagan bo'lsa
            // ham "tasdiqlangan" deb belgilanib, mukofot to'lab yuborilardi (real
            // holatda shunday soxta tasdiqlash yuz berdi). Endi kamida oxirgi 5 ta
            // raqam (ko'rinadigan qism) mos kelishi SHART, va faqat bitta sahifa
            // emas, so'nggi bir necha sahifa (eng yangi ~75 ta ovoz) tekshiriladi.
            if (!shouldApprove && !shouldReject && botRecord?.initiativeUuid) {
              try {
                const cleanPhone = vote.phone.replace(/\D/g, '');
                // 5 ta raqam ham amalda yetarlicha zaif bo'lib chiqdi (bitta soxta
                // tasdiqlash yana yuz berdi). OpenBudget maskalangan raqamda FAQAT
                // oxirgi 6 ta raqamni ko'rsatadi (masalan "**-*88-37-10" -> "883710"),
                // shuning uchun 6 — bu yerda erishsa bo'ladigan ENG YUQORI aniqlik —
                // va vaqt oynasi ham 2 daqiqadan 60 soniyaga qisqartirildi.
                const MIN_SUFFIX_LEN = 6;
                const voteTs = new Date(vote.createdAt).getTime();
                const SIXTY_SECONDS_MS = 60 * 1000;

                let matchedInRegistry: any = null;
                for (let p = 0; p < 5 && !matchedInRegistry; p++) {
                  const offVotes = await this.openBudgetService.fetchOfficialInitiativeVotesList(botRecord.initiativeUuid, p);
                  if (!offVotes.success || !Array.isArray(offVotes.content) || offVotes.content.length === 0) break;

                  matchedInRegistry = offVotes.content.find((item: any) => {
                    const itemPhone = (item.phoneNumber || '').replace(/\D/g, '');
                    const len = Math.min(MIN_SUFFIX_LEN, itemPhone.length, cleanPhone.length);
                    const isPhoneMatch = len >= MIN_SUFFIX_LEN && itemPhone.slice(-len) === cleanPhone.slice(-len);
                    if (!isPhoneMatch) return false;

                    if (item.voteDate) {
                      // OpenBudget voteDate Tashkent vaqtida keladi ("YYYY-MM-DD HH:mm:ss")
                      const formattedDateStr = item.voteDate.includes('+')
                        ? item.voteDate
                        : item.voteDate.replace(' ', 'T') + '+05:00';
                      const itemTs = new Date(formattedDateStr).getTime();
                      const diffMs = Math.abs(voteTs - itemTs);
                      return !isNaN(itemTs) && diffMs <= SIXTY_SECONDS_MS;
                    }
                    return false;
                  }) || null;

                  if (offVotes.totalPages && p >= offVotes.totalPages - 1) break;
                }

                if (matchedInRegistry) {
                  shouldApprove = true;
                  checkReason = `[OpenBudget Rasmiy Reyestridan tasdiqlandi (aniq 6 raqam + ±60s vaqt mosligi): ${matchedInRegistry.phoneNumber} (${matchedInRegistry.voteDate})]`;
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
              // Tasdiqlash sababini bazaga ham yozib qo'yamiz — docker konteyner qayta
              // tiklanganda (deploy) console loglari yo'qolib qoladi, lekin bu audit
              // izi saqlanib qoladi va keyinchalik "nega tasdiqlandi?" deb tekshirish
              // mumkin bo'ladi.
              await this.prisma.vote.update({ where: { id: vote.id }, data: { errorMessage: `[AUTO-APPROVE ${new Date().toISOString()}] ${checkReason}` } }).catch(() => {});

              const creditRes = await this.walletService.verifyVoteAndCredit(vote.id);
              if (!creditRes.alreadyVerified) {
                this.logger.log(`✅ [Auto-Approver] Ovoz #${vote.id} (+${vote.phone}) tasdiqlandi! Sabab: ${checkReason}`);

                // Admin panelidan qo'lda tasdiqlashda ishlatiladigan xabar bilan BIR XIL
                // matn — foydalanuvchi qaysi yo'l bilan tasdiqlanishidan qat'i nazar
                // (avtomatik reyestr-moslik yoki admin qo'lda) bir xil xabarni ko'rishi kerak.
                const msg = BOT_MESSAGES.VOTE_VERIFIED_ALERT(vote.phone, creditRes.rewardAmount, creditRes.user.balance);

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

    // 🔄 Har 30 daqiqada, admin panel tez ochilishi uchun OpenBudget rasmiy
    // ro'yxatining BARCHA sahifalarini fon rejimida oldindan keshlab qo'yish.
    // MUHIM: bitta to'liq sikl (barcha ~218 sahifa, IP-blok tufayli bir necha marta
    // brauzer qayta ishga tushirilib) 30 daqiqadan ko'proq davom etishi mumkin —
    // avval bunday holatda YANGI sikl eskisi ustidan boshlanib, uni to'xtatib
    // qo'yardi (hech qachon to'liq tugamas edi). Endi qayta kirishga qarshi
    // himoya (re-entrancy guard) bilan, oldingi sikl tugamaguncha yangisi
    // boshlanmaydi.
    let prewarmRunning = false;
    const runPrewarm = async () => {
      if (prewarmRunning) {
        this.logger.log(`⏭ [Prewarm] Oldingi sikl hali tugamagan, bu safar o'tkazib yuborilmoqda.`);
        return;
      }
      prewarmRunning = true;
      const cycleStartedAt = Date.now();
      try {
        const activeBots = await this.prisma.botInstance.findMany({
          where: { isActive: true, initiativeUuid: { not: null } },
        });
        for (const bot of activeBots) {
          if (!bot.initiativeUuid) continue;
          this.logger.log(`🔄 [Prewarm] "${bot.mahallaName}" uchun rasmiy ro'yxat fon rejimida yuklanmoqda...`);
          await this.openBudgetService.prewarmOfficialVotesCache(bot.initiativeUuid).catch((e: any) =>
            this.logger.warn(`Prewarm xatoligi (${bot.mahallaName}): ${e.message}`),
          );
        }

        // KUZATUV: botlar bittadan ko'payib ketsa (hozir 1 ta), ular navbat bilan
        // (ketma-ket) keshlanadi — bitta umumiy Chrome/proxy sessiyasi ishlatilgani
        // uchun. Agar to'liq sikl 30 daqiqalik oralig'idan uzoqroq davom etsa, bu
        // degani ba'zi botlar navbati kelmasdan eskirib qolishi mumkin — shu holat
        // sezilishi uchun aniq ogohlantirish yoziladi (kod o'zgartirilmasdan oldin).
        const cycleMs = Date.now() - cycleStartedAt;
        if (activeBots.length > 0 && cycleMs > 25 * 60 * 1000) {
          this.logger.warn(`⚠️ [Prewarm] To'liq sikl ${Math.round(cycleMs / 60000)} daqiqa davom etdi (${activeBots.length} ta bot) — 30 daqiqalik oraliqqa yaqinlashmoqda, ba'zi botlar navbati kechikishi mumkin.`);
        }
      } catch (err: any) {
        this.logger.error(`Prewarm sikli xatoligi: ${err.message}`);
      } finally {
        prewarmRunning = false;
      }
    };
    setTimeout(() => runPrewarm().catch(() => {}), 30000);
    setInterval(runPrewarm, 30 * 60 * 1000);
  }
}
