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
  private sendMessageCallback: ((botId: number | null, telegramId: string, text: string) => Promise<void>) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly openBudgetService: OpenBudgetService,
    private readonly walletService: WalletService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * ⚡ Yangi ovozni ZUDLIK BILAN (jonli rasmiy reyestr bo'yicha) tekshirish va tasdiqlash
   */
  async verifyVoteImmediately(voteId: number): Promise<{ approved: boolean; rejected: boolean; reason?: string }> {
    try {
      const vote = await this.prisma.vote.findUnique({
        where: { id: voteId },
        include: { user: true, botInstance: true },
      });
      if (!vote) return { approved: false, rejected: false, reason: 'Ovoz topilmadi' };
      if (vote.status === 'VERIFIED') return { approved: true, rejected: false };

      return await this.processVote(vote, true);
    } catch (e: any) {
      this.logger.error(`verifyVoteImmediately error: ${e.message}`);
      return { approved: false, rejected: false, reason: e.message };
    }
  }

  async checkVoteNow(voteId: number): Promise<void> {
    if (!this.sendMessageCallback) return;
    try {
      const vote = await this.prisma.vote.findUnique({
        where: { id: voteId },
        include: { user: true, botInstance: true },
      });
      if (!vote || vote.status !== 'PENDING_VERIFICATION') return;
      await this.processVote(vote);
    } catch (e: any) {
      this.logger.debug(`[checkVoteNow] Ovoz #${voteId} darhol tekshirishda xatolik: ${e.message}`);
    }
  }

  /**
   * ⚡ Barcha kutilayotgan ovozlarni zudlik bilan tekshirish (masalan captcha yechilgandan so'ng)
   */
  async checkAllPendingVotes(): Promise<number> {
    try {
      const pendingVotes = await this.prisma.vote.findMany({
        where: { status: 'PENDING_VERIFICATION' },
        include: { user: true, botInstance: true },
      });
      for (const vote of pendingVotes) {
        await this.processVote(vote).catch(() => {});
      }
      return pendingVotes.length;
    } catch (e: any) {
      this.logger.error(`checkAllPendingVotes error: ${e.message}`);
      return 0;
    }
  }

  /**
   * 🤖 Har 15 minutda kutilayotgan ovozlarni OpenBudget API va vaqt bo'yicha avtomatik tekshirish
   */
  startLiveVoteChecker(sendMessageCallback: (botId: number | null, telegramId: string, text: string) => Promise<void>) {
    this.sendMessageCallback = sendMessageCallback;
    const runCheck = async () => {
      try {
        const pendingVotes = await this.prisma.vote.findMany({
          where: { status: 'PENDING_VERIFICATION' },
          include: { user: true, botInstance: true },
          take: 100,
        });

        let newlyApproved = 0;
        let newlyRejected = 0;

        if (pendingVotes.length > 0) {
          this.logger.log(`🔍 [Auto-Approver 1-Hour Sync] ${pendingVotes.length} ta kutilayotgan ovoz tekshirilmoqda...`);

          for (const vote of pendingVotes) {
            try {
              const res = await this.processVote(vote);
              if (res.approved) newlyApproved++;
              if (res.rejected) newlyRejected++;
            } catch (voteErr: any) {
              this.logger.warn(`Ovoz #${vote.id} tekshiruvida xatolik: ${voteErr.message}`);
            }
          }
        }

        // Har soatlik admin hisoboti:
        const remainingPending = await this.prisma.vote.count({ where: { status: 'PENDING_VERIFICATION' } });
        const activeBots = await this.prisma.botInstance.findMany({ where: { isActive: true } });
        const adminIds = this.configService.get<string[]>('bot.adminIds') || ['8140304652', '2053690211', '5957905121'];

        const tashkentTime = new Date().toLocaleTimeString('uz-UZ', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' });
        for (const b of activeBots) {
          const reportMsg = BOT_MESSAGES.HOURLY_ADMIN_REPORT({
            time: tashkentTime,
            approvedCount: newlyApproved,
            rejectedCount: newlyRejected,
            pendingCount: remainingPending,
            totalOpenBudgetVotes: (b as any).openBudgetVotes || b.currentVotes || 0,
            mahallaName: b.mahallaName,
          });

          for (const adminId of adminIds) {
            await this.sendMessageCallback?.(b.id, adminId, reportMsg).catch(() => {});
          }
        }
      } catch (err: any) {
        this.logger.error(`LiveVoteChecker xatoligi: ${err.message}`);
      }
    };

    // Server ko'tarilishi bilan 5 soniyadan so'ng 1-marta tekshirish
    setTimeout(() => {
      runCheck().catch(() => {});
    }, 5000);

    // Keyin har 1 soatda (60 * 60 * 1000 ms) fon rejimida tekshirish (24/7 uzluksiz)
    const ONE_HOUR_MS = 60 * 60 * 1000;
    this.checkInterval = setInterval(() => {
      runCheck().catch(() => {});
    }, ONE_HOUR_MS);
    this.logger.log(`🕒 [Auto-Approver] Ovozlar va rasmiy hisoblar har 1 soatda 24/7 uzluksiz tekshiriladi.`);

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

        const cycleMs = Date.now() - cycleStartedAt;
        if (activeBots.length > 0 && cycleMs > 25 * 60 * 1000) {
          this.logger.warn(`⚠️ [Prewarm] To'liq sikl ${Math.round(cycleMs / 60000)} daqiqa davom etdi (${activeBots.length} ta bot).`);
        }
      } catch (err: any) {
        this.logger.error(`Prewarm sikli xatoligi: ${err.message}`);
      } finally {
        prewarmRunning = false;
      }
    };
    setTimeout(() => {
      runPrewarm().catch(() => {});
    }, 30000);
    setInterval(runPrewarm, 60 * 60 * 1000);
  }

  /**
   * Bitta ovozni OpenBudget API va rasmiy reyestr bo'yicha tekshirish, kerak
   * bo'lsa tasdiqlash/rad etish va foydalanuvchini xabardor qilish. Bu ham
   * 15-daqiqalik davriy siklda, ham checkVoteNow() orqali darhol chaqiriladi.
   */
  private async processVote(vote: any, forceRegistryRefresh = false): Promise<{ approved: boolean; rejected: boolean; reason?: string }> {
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

    // 1.5. RASMIY OCHIQ BUDJET REYESTRIDAN TEKSHIRISH
    //
    // MUHIM XAVFSIZLIK TUZATISHI: bu blok "suffix2" (faqat OXIRGI 2 TA RAQAM)
    // ni ALOHIDA yetarli mezon sifatida qabul qilar edi (OR orqali), vaqt
    // oynasi esa ±3 daqiqagacha kengaytirilgan edi. Bu — aynan shu sessiyada
    // ERTA (3 marta ketma-ket) SOXTA PUL TASDIQLASHGA sabab bo'lgan mezonning
    // O'ZI (boshqa odamning ovozi tasodifan oxirgi 2 raqami va vaqt oynasi mos
    // kelib qolganda, bizning foydalanuvchimiz HAQIQATDA ovoz bermagan bo'lsa
    // ham "tasdiqlangan" deb hisoblanardi). `visible6` (OpenBudget maskalangan
    // raqamda ko'rinadigan TO'LIQ 6 ta raqam) — bu yerda yetarlicha aniq va
    // yagona mezon sifatida qoldirilgan; zaif suffix4/suffix2 zaxira variantlari
    // OLIB TASHLANDI. Vaqt oynasi ham 60 soniyagacha qisqartirildi.
    if (!shouldApprove && !shouldReject && botRecord?.initiativeUuid) {
      try {
        const cleanPhone = vote.phone.replace(/\D/g, '');
        const clean9 = cleanPhone.slice(-9);
        const visible6 = clean9.length >= 9 ? clean9.slice(3) : clean9.slice(-6); // e.g. "642827" for +998 95 064 28 27
        const voteTs = new Date(vote.createdAt).getTime();
        const SIXTY_SECONDS_MS = 60 * 1000; // Aniq [-60s : +60s] oralig'i

        let matchedInRegistry: any = null;
        for (let p = 0; p < 10 && !matchedInRegistry; p++) {
          const offVotes = await this.openBudgetService.fetchOfficialInitiativeVotesList(botRecord.initiativeUuid, p, 15, forceRegistryRefresh && p === 0);
          if (!offVotes.success || !Array.isArray(offVotes.content) || offVotes.content.length === 0) break;

          matchedInRegistry = offVotes.content.find((item: any) => {
            const rawItemPhone = String(item.phoneNumber || '');
            const itemDigits = rawItemPhone.replace(/\D/g, '');
            if (!itemDigits || visible6.length < 6) return false;

            // 1) Raqam mosligi: FAQAT aniq, to'liq ko'rinadigan 6 ta raqam mos kelsa
            const isDigitMatch = itemDigits.endsWith(visible6);
            if (!isDigitMatch) return false;

            // 2) Aniq vaqt tekshiruvi: Ovoz berilgan vaqt bilan strictly [-60s : +60s] oralig'ida
            if (item.voteDate) {
              const formattedDateStr = String(item.voteDate).includes('+')
                ? item.voteDate
                : String(item.voteDate).replace(' ', 'T') + '+05:00';
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
          checkReason = `[OpenBudget Rasmiy Reyestridan tasdiqlandi (Raqam ${matchedInRegistry.phoneNumber}, Vaqt: ${matchedInRegistry.voteDate}, +-3m moslik) UTC+5]`;
        }
      } catch (regErr: any) {
        this.logger.debug(`Registry match error: ${regErr.message}`);
      }
    }

    // 1.8. 2 SOATDAN ORTIQ KUTILGAN OVOZLARNI AVTOMATIK RAD ETISH
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    const voteAgeMs = Date.now() - new Date(vote.createdAt).getTime();
    if (!shouldApprove && !shouldReject && voteAgeMs > TWO_HOURS_MS) {
      shouldReject = true;
      rejectReason = "Ushbu raqam 2 soat ichida OpenBudget rasmiy reyestridan o'tmadi (avval boshqa tashabbusga ovoz berilgan yoki bekor qilingan bo'lishi mumkin).";
    }

    // 2. RAD ETISH HOLATI
    if (shouldReject) {
      await this.prisma.vote.update({
        where: { id: vote.id },
        data: {
          status: 'REJECTED',
          errorMessage: rejectReason,
          completedAt: new Date(),
        },
      });
      this.logger.warn(`❌ [Auto-Approver] Ovoz #${vote.id} (+${vote.phone}) rad etildi: ${rejectReason}`);

      const rejectMsg = BOT_MESSAGES.VOTE_REJECTED_STALE(vote.phone, botRecord?.mahallaName);
      await this.sendMessageCallback?.(vote.botInstanceId, vote.user.telegramId, rejectMsg).catch(() => {});
      return { approved: false, rejected: true, reason: rejectReason };
    }

    // 3. TASDIQLASH VA HISOBGA PUL O'TKAZISH
    if (shouldApprove) {
      await this.prisma.vote.update({ where: { id: vote.id }, data: { errorMessage: `[AUTO-APPROVE ${new Date().toISOString()}] ${checkReason}` } }).catch(() => {});

      const creditRes = await this.walletService.verifyVoteAndCredit(vote.id);
      if (!creditRes.alreadyVerified) {
        this.logger.log(`✅ [Auto-Approver] Ovoz #${vote.id} (+${vote.phone}) tasdiqlandi! Sabab: ${checkReason}`);
        const msg = BOT_MESSAGES.VOTE_VERIFIED_ALERT(vote.phone, creditRes.rewardAmount, creditRes.user.balance);
        await this.sendMessageCallback?.(vote.botInstanceId, vote.user.telegramId, msg).catch(() => {});
      }
      return { approved: true, rejected: false };
    }

    return { approved: false, rejected: false };
  }
}
