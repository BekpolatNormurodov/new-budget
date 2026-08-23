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

        if (pendingVotes.length === 0) return;
        this.logger.log(`🔍 [Auto-Approver 15-Min Sync] ${pendingVotes.length} ta kutilayotgan ovoz tekshirilmoqda...`);

        for (const vote of pendingVotes) {
          try {
            await this.processVote(vote);
          } catch (voteErr: any) {
            this.logger.warn(`Ovoz #${vote.id} tekshiruvida xatolik: ${voteErr.message}`);
          }
        }
      } catch (err: any) {
        this.logger.error(`LiveVoteChecker xatoligi: ${err.message}`);
      }
      // MUHIM: `syncAllBotVotes()` bu yerda ILGARI ham chaqirilar edi — lekin
      // `SystemHealthService`'da AYNAN shu funksiya uchun ALOHIDA, o'zining
      // mustaqil 15-daqiqalik rejalashtiruvchisi allaqachon bor edi. Ikkalasi
      // ham dastur ishga tushishi bilan bir necha soniya farq bilan boshlanib,
      // 15 daqiqalik interval bir xil bo'lgani uchun HAR DOIM deyarli bir vaqtda
      // (soniya farqi bilan) ishga tushib, og'ir (headless-brauzer + butun
      // reyestrni qayta yuklovchi) ishni behuda IKKI MARTA bajarardi — bu esa
      // botning vaqtincha "qotib qolgan"dek sezilishiga sabab bo'lishi mumkin
      // edi. Endi faqat SystemHealthService orqali, bir marta ishga tushadi.
    };

    function isUzbekistanNightTime(): boolean {
      const now = new Date();
      const utcHours = now.getUTCHours();
      const uzbHours = (utcHours + 5) % 24;
      return uzbHours >= 1 && uzbHours < 6; // 01:00 dan 06:00 gacha (00:00 - 01:00 oralig'ida ham faol ishlaydi)
    }

    // Server ko'tarilishi bilan 5 soniyadan so'ng 1-marta tekshirish (agar kechasi bo'lmasa)
    setTimeout(() => {
      if (!isUzbekistanNightTime()) {
        runCheck().catch(() => {});
      }
    }, 5000);

    // Keyin har 1 soatda (60 * 60 * 1000 ms) fon rejimida tekshirish (Tungi rejimda uxlaydi)
    const ONE_HOUR_MS = 60 * 60 * 1000;
    this.checkInterval = setInterval(() => {
      if (isUzbekistanNightTime()) {
        this.logger.log('🌙 [Tungi Rejim: 00:00 - 06:00] Auto-Approver va ovozlar sinxroni uyquda. Soat 06:00 da davom etadi.');
        return;
      }
      runCheck().catch(() => {});
    }, ONE_HOUR_MS);
    this.logger.log(`🕒 [Auto-Approver] Ovozlar va rasmiy hisoblar har 1 soatda bir marta tekshiriladi (Tungi 00:00-06:00 oralig'ida uyquda).`);

    let prewarmRunning = false;
    const runPrewarm = async () => {
      if (isUzbekistanNightTime()) {
        this.logger.log('🌙 [Tungi Rejim: 00:00 - 06:00] Prewarm kesh sikli uyquda. Soat 06:00 da davom etadi.');
        return;
      }
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
      if (!isUzbekistanNightTime()) runPrewarm().catch(() => {});
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

    // 1.5. RASMIY OCHIQ BUDJET REYESTRIDAN TEKSHIRISH (Operator + Suffix & Timestamp strictly [-2 min : +2 min])
    if (!shouldApprove && !shouldReject && botRecord?.initiativeUuid) {
      try {
        const cleanPhone = vote.phone.replace(/\D/g, '');
        const clean9 = cleanPhone.slice(-9);
        const suffix2 = clean9.slice(-2); // e.g. "27"
        const suffix4 = clean9.slice(-4); // e.g. "2827"
        const visible6 = clean9.length >= 9 ? clean9.slice(3) : suffix4; // e.g. "642827" for +998 95 064 28 27
        const voteTs = new Date(vote.createdAt).getTime();
        const THREE_MINUTES_MS = 3 * 60 * 1000; // Aniq [-3 minut : +3 minut] oralig'i

        let matchedInRegistry: any = null;
        for (let p = 0; p < 10 && !matchedInRegistry; p++) {
          const offVotes = await this.openBudgetService.fetchOfficialInitiativeVotesList(botRecord.initiativeUuid, p, 15, forceRegistryRefresh && p === 0);
          if (!offVotes.success || !Array.isArray(offVotes.content) || offVotes.content.length === 0) break;

          matchedInRegistry = offVotes.content.find((item: any) => {
            const rawItemPhone = String(item.phoneNumber || '');
            const itemDigits = rawItemPhone.replace(/\D/g, '');
            if (!itemDigits) return false;

            // 1) Raqam mosligi: OpenBudget formati **-*64-28-27 bo'lib, oxirgi 6 yoki 4 ta raqami mos keladi
            const isDigitMatch = (itemDigits === visible6) || itemDigits.endsWith(suffix4) || itemDigits.endsWith(suffix2);
            if (!isDigitMatch) return false;

            // 2) Aniq vaqt tekshiruvi: Ovoz berilgan vaqt bilan strictly [-3 daqiqa : +3 daqiqa] oralig'ida
            if (item.voteDate) {
              const formattedDateStr = String(item.voteDate).includes('+')
                ? item.voteDate
                : String(item.voteDate).replace(' ', 'T') + '+05:00';
              const itemTs = new Date(formattedDateStr).getTime();
              const diffMs = Math.abs(voteTs - itemTs);
              return !isNaN(itemTs) && diffMs <= THREE_MINUTES_MS;
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
