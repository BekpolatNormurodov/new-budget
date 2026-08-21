import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as FormData from 'form-data';
import { Telegraf, Context } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';
import { OpenBudgetService } from '../openbudget/openbudget.service';
import { WalletService } from '../wallet/wallet.service';
import { BOT_MESSAGES, BOT_BUTTONS, formatSum } from './bot.constants';
import { BotKeyboards } from './bot.keyboards';

export interface ActiveBot {
  id: number;
  token: string;
  bot: Telegraf;
  info: any;
  record: any;
}

@Injectable()
export class BotManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotManagerService.name);
  private activeBots: Map<number, ActiveBot> = new Map();
  private autoApproveInterval: any = null;
  private supervisorInterval: any = null;
  private smsTimeouts: Map<string, NodeJS.Timeout> = new Map(); // key: "botId_userId"
  private votingSessionTimeouts: Map<string, NodeJS.Timeout> = new Map(); // key: "botId_userId"

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly openBudgetService: OpenBudgetService,
    private readonly walletService: WalletService,
  ) {}

  private async clearAllTimeouts(botId: number, userId: number) {
    const key = `${botId}_${userId}`;
    if (this.smsTimeouts.has(key)) {
      clearTimeout(this.smsTimeouts.get(key));
      this.smsTimeouts.delete(key);
    }
    if (this.votingSessionTimeouts.has(key)) {
      clearTimeout(this.votingSessionTimeouts.get(key));
      this.votingSessionTimeouts.delete(key);
    }
  }

  private startVotingSessionTimer(botId: number, userId: number, telegramId: string) {
    const key = `${botId}_${userId}`;
    if (this.votingSessionTimeouts.has(key)) {
      clearTimeout(this.votingSessionTimeouts.get(key));
    }

    const timer = setTimeout(async () => {
      try {
        const freshUser = await this.prisma.user.findUnique({ where: { id: userId } });
        if (freshUser && ['AWAITING_PHONE', 'AWAITING_SMS_CODE'].includes(freshUser.step || '')) {
          await this.prisma.user.update({
            where: { id: userId },
            data: { step: null, tempData: null },
          });
          const activeBot = this.activeBots.get(botId);
          if (activeBot) {
            await activeBot.bot.telegram.sendMessage(
              telegramId,
              `⏱ <b>Ovoz berish sessiyasi vaqti (10 daqiqa) tugadi!</b>\n\nIltimos, qaytadan <b>"🗳 Ovoz berish"</b> tugmasini bosing:`,
              { parse_mode: 'HTML', ...BotKeyboards.mainMenu(freshUser.role === 'ADMIN') }
            ).catch(() => {});
          }
        }
      } catch (e) {}
    }, 10 * 60 * 1000); // 10 daqiqa

    this.votingSessionTimeouts.set(key, timer);
  }

  async onModuleInit() {
    await this.seedInitialBotIfEmpty();
    await this.launchAllActiveBots();
    this.startVoteAutoApprover();
    this.startBotSupervisor();
  }

  async onModuleDestroy() {
    if (this.autoApproveInterval) clearInterval(this.autoApproveInterval);
    if (this.supervisorInterval) clearInterval(this.supervisorInterval);
    for (const [id, activeBot] of this.activeBots.entries()) {
      try {
        activeBot.bot.stop('SIGTERM');
      } catch (e) {}
    }
    this.activeBots.clear();
  }

  /**
   * Agar bazada hali hech qanday bot bo'lmasa, birlamchi botni yaratish
   */
  private async seedInitialBotIfEmpty() {
    const count = await this.prisma.botInstance.count();
    if (count === 0) {
      const defaultToken = this.configService.get<string>('bot.token') || '8973530886:AAFjlBqhJgVaKseHVs1Eved6_ARENGeCAoc';
      const defaultUrl = 'https://openbudget.uz/boards/initiatives/initiative/53/7710ad19-6734-4df9-ab25-a5d2de6facbf';
      const parsed = this.openBudgetService.parseInitiativeUrl(defaultUrl);

      await this.prisma.botInstance.create({
        data: {
          name: 'Navbahor MFY Boti (Asosiy)',
          token: defaultToken,
          mahallaId: '055495798013',
          mahallaName: 'Navbahor MFY',
          openBudgetUrl: defaultUrl,
          boardId: parsed.boardId || '53',
          initiativeUuid: parsed.initiativeUuid || '7710ad19-6734-4df9-ab25-a5d2de6facbf',
          targetVotes: 5000,
          currentVotes: 1420,
          voteReward: 30000,
          refBonus: 5000,
          isActive: true,
          status: 'ONLINE',
        },
      });

      // 2-test mahallani ham bazaga kiritib qo'yamiz (ixtiyoriy 2-bot uchun)
      const url2 = 'https://openbudget.uz/boards/initiatives/initiative/55/831adc38-fac5-4ee3-babc-b5a9b7310342';
      const parsed2 = this.openBudgetService.parseInitiativeUrl(url2);
      await this.prisma.initiative.create({
        data: {
          openBudgetId: '055538434014',
          mahallaId: '055538434014',
          mahallaName: 'Do\'stlik MFY',
          url: url2,
          boardId: parsed2.boardId || '55',
          initiativeUuid: parsed2.initiativeUuid || '831adc38-fac5-4ee3-babc-b5a9b7310342',
          title: 'Do\'stlik MFY maktab va bog\'chasini ta\'mirlash',
          targetVotes: 5000,
          currentVotes: 890,
          pricePerVote: 4500,
          rewardPerVote: 30000,
          isActive: true,
          isDefault: false,
        },
      }).catch(() => {});
    }
  }

  /**
   * Bazadagi barcha faol botlarni ishga tushirish
   */
  async launchAllActiveBots() {
    const bots = await this.prisma.botInstance.findMany({ where: { isActive: true } });
    this.logger.log(`🚀 Jami ${bots.length} ta faol bot topildi. Ishga tushirilmoqda...`);

    for (const botRecord of bots) {
      await this.startBotInstance(botRecord);
    }
  }

  /**
   * Alohida bot instansiyasini ishga tushirish
   */
  async startBotInstance(botRecord: any): Promise<boolean> {
    try {
      if (this.activeBots.has(botRecord.id)) {
        this.logger.warn(`Bot #${botRecord.id} allaqachon ishlab turibdi`);
        return true;
      }

      const bot = new Telegraf(botRecord.token);
      this.setupBotHandlers(bot, botRecord);

      const botInfo = await bot.telegram.getMe();

      // Telegram Bot Menu komandalarini ro'yxatdan o'tkazish
      await bot.telegram.setMyCommands([
        { command: 'start', description: '🚀 Botni ishga tushirish' },
        { command: 'vote', description: '🗳 Ovoz berish (+30 000 so\'m)' },
        { command: 'balance', description: '💰 Balans va hisob' },
        { command: 'withdraw', description: '📩 Pulni yechib olish' },
        { command: 'referral', description: '🔗 Referal havola (+5 000 so\'m)' },
        { command: 'help', description: 'ℹ️ Yordam va qoidalar' },
        { command: 'cancel', description: '❌ Bekor qilish' },
      ]).catch(() => {});

      // Bot profili va tavsifini avtomatik sozlash
      await bot.telegram.setMyDescription(
        `🇺🇿 ${botRecord.mahallaName} Ochiq Budjet 2026 rasmiy ovoz berish boti.\n\n` +
        `💰 Har bir ovoz uchun: ${formatSum(botRecord.voteReward || 30000)} so'm mukofot\n` +
        `👥 Taklif qilingan har bir do'st uchun: +${formatSum(botRecord.refBonus || 5000)} so'm bonus\n` +
        `⏱ SMS kod vaqti: 2 daqiqa (120s)\n` +
        `📌 1 Pasport = 1 Ovoz\n\n` +
        `👑 Rasmiy Adminlar & Bog'lanish:\n` +
        `📞 +998 99 065 26 51 (@JONIBEKISMOILOV - Jonibek)\n` +
        `📞 +998 94 348 99 00 (@Elbek_Muxtorovv - Elbek)\n\n` +
        `Ovoz berish uchun pastdagi "Boshlash" (/start) tugmasini bosing 👇`
      ).catch(() => {});

      await bot.telegram.setMyShortDescription(
        `💰 ${botRecord.mahallaName} — Ovoz: ${formatSum(botRecord.voteReward || 30000)} so'm! Adminlar: +998990652651, +998943489900`
      ).catch(() => {});

      await bot.telegram.setMyName(botRecord.name || `Open Budget | ${botRecord.mahallaName}`).catch(() => {});

      await this.prisma.botInstance.update({
        where: { id: botRecord.id },
        data: {
          botUsername: botInfo.username,
          status: 'ONLINE',
          lastError: null,
        },
      });

      this.activeBots.set(botRecord.id, {
        id: botRecord.id,
        token: botRecord.token,
        bot,
        info: botInfo,
        record: botRecord,
      });

      bot.launch().catch((err) => {
        this.logger.error(`Bot @${botInfo.username} launch error:`, err);
        this.prisma.botInstance.update({
          where: { id: botRecord.id },
          data: { status: 'ERROR', lastError: err.message },
        }).catch(() => {});
      });

      this.logger.log(`✅ [Bot #${botRecord.id}] @${botInfo.username} (${botRecord.mahallaName}) muvaffaqiyatli ishga tushdi!`);
      return true;
    } catch (err: any) {
      this.logger.error(`Bot #${botRecord.id} ni ishga tushirishda xatolik:`, err);
      await this.prisma.botInstance.update({
        where: { id: botRecord.id },
        data: { status: 'ERROR', lastError: err.message },
      }).catch(() => {});
      return false;
    }
  }

  /**
   * Botni to'xtatish
   */
  async stopBotInstance(botId: number): Promise<boolean> {
    const active = this.activeBots.get(botId);
    if (active) {
      try {
        active.bot.stop('SIGTERM');
      } catch (e) {}
      this.activeBots.delete(botId);
    }
    await this.prisma.botInstance.update({
      where: { id: botId },
      data: { status: 'STOPPED', isActive: false },
    });
    this.logger.log(`🛑 [Bot #${botId}] to'xtatildi.`);
    return true;
  }

  /**
   * Yangi bot qo'shish va bir zumda ishga tushirish
   */
  async addAndStartNewBot(params: {
    name: string;
    token: string;
    mahallaId: string;
    mahallaName: string;
    openBudgetUrl: string;
    targetVotes?: number;
    voteReward?: number;
    refBonus?: number;
    avatarUrl?: string;
    description?: string;
  }) {
    const parsed = this.openBudgetService.parseInitiativeUrl(params.openBudgetUrl);

    let avatarUrl = params.avatarUrl;
    if (params.avatarUrl && params.avatarUrl.startsWith('data:image')) {
      try {
        const base64Data = params.avatarUrl.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const avatarsDir = path.join(process.cwd(), 'public', 'avatars');
        if (!fs.existsSync(avatarsDir)) {
          fs.mkdirSync(avatarsDir, { recursive: true });
        }
        const fileName = `bot_${Date.now()}.jpg`;
        fs.writeFileSync(path.join(avatarsDir, fileName), buffer);
        avatarUrl = `/avatars/${fileName}`;
      } catch (err: any) {
        this.logger.error(`Bot avatarini saqlashda xatolik: ${err.message}`);
      }
    }

    const botRecord = await this.prisma.botInstance.create({
      data: {
        name: params.name,
        token: params.token.trim(),
        mahallaId: params.mahallaId.trim(),
        mahallaName: params.mahallaName.trim(),
        openBudgetUrl: params.openBudgetUrl.trim(),
        boardId: parsed.boardId || '53',
        initiativeUuid: parsed.initiativeUuid || params.mahallaId,
        targetVotes: params.targetVotes || 5000,
        voteReward: params.voteReward || 30000,
        refBonus: params.refBonus || 5000,
        avatarUrl: avatarUrl || '/assets/open_budget_avatar.jpg',
        description: params.description ? params.description.trim() : null,
        isActive: true,
        status: 'ONLINE',
      },
    });

    const started = await this.startBotInstance(botRecord);
    return { botRecord, started };
  }

  /**
   * Barcha faol botlar ro'yxatini holati bilan olish
   */
  async getBotsList() {
    const bots = await this.prisma.botInstance.findMany({
      include: {
        _count: { select: { votes: true, users: true } },
      },
      orderBy: { id: 'asc' },
    });

    const result = [];
    for (const b of bots) {
      const verifiedVotes = await this.prisma.vote.count({
        where: { botInstanceId: b.id, status: 'VERIFIED' },
      });
      const pendingVotes = await this.prisma.vote.count({
        where: { botInstanceId: b.id, status: 'PENDING_VERIFICATION' },
      });
      const totalCollected = verifiedVotes + pendingVotes;
      const target = b.targetVotes || 5000;
      const remaining = Math.max(0, target - totalCollected);
      const percentage = Math.min(100, Math.round((totalCollected / (target || 1)) * 100));

      result.push({
        ...b,
        currentVotes: verifiedVotes,
        pendingVotes,
        totalCollectedVotes: totalCollected,
        remainingVotes: remaining,
        percentage,
        isTargetReached: totalCollected >= target,
        isLiveRunning: this.activeBots.has(b.id),
      });
    }

    return result;
  }

  /**
   * Foydalanuvchiga tegishli bot orqali real-time Telegram xabar yuborish
   */
  async sendMessageToUser(telegramId: string, message: string, botInstanceId?: number, extra: any = { parse_mode: 'HTML' }): Promise<boolean> {
    try {
      let targetBot: Telegraf | null = null;

      if (botInstanceId && this.activeBots.has(botInstanceId)) {
        targetBot = this.activeBots.get(botInstanceId)!.bot;
      } else if (this.activeBots.size > 0) {
        targetBot = this.activeBots.values().next().value?.bot;
      }

      if (targetBot && telegramId) {
        await targetBot.telegram.sendMessage(telegramId, message, extra);
        this.logger.log(`📩 Xabar yuborildi [tgId: ${telegramId}]`);
        return true;
      }
      return false;
    } catch (err: any) {
      this.logger.error(`Foydalanuvchiga (${telegramId}) xabar yuborishda xatolik: ${err.message}`);
      return false;
    }
  }

  /**
   * Foydalanuvchiga Telegram orqali to'lov cheki rasmini yuborish (Axios + FormData orqali 100% kafolatlangan)
   */
  async sendPhotoToUser(telegramId: string, photoSourceOrUrl: string, caption: string, botInstanceId?: number): Promise<boolean> {
    try {
      let botToken: string | undefined = undefined;

      if (botInstanceId && this.activeBots.has(botInstanceId)) {
        botToken = this.activeBots.get(botInstanceId)!.record.token;
      } else if (this.activeBots.size > 0) {
        botToken = this.activeBots.values().next().value?.record.token;
      } else {
        botToken = this.configService.get<string>('bot.token');
      }

      if (!botToken || !telegramId) {
        this.logger.error(`Bot token yoki Telegram ID topilmadi [tgId: ${telegramId}]`);
        return false;
      }

      const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;

      try {
        if (photoSourceOrUrl.startsWith('http')) {
          await axios.post(url, {
            chat_id: telegramId,
            photo: photoSourceOrUrl,
            caption: caption,
            parse_mode: 'HTML',
          }, { timeout: 20000 });
        } else if (fs.existsSync(photoSourceOrUrl)) {
          const form = new FormData();
          form.append('chat_id', telegramId);
          form.append('caption', caption);
          form.append('parse_mode', 'HTML');
          form.append('photo', fs.createReadStream(photoSourceOrUrl));

          await axios.post(url, form, {
            headers: form.getHeaders(),
            timeout: 25000,
          });
        }

        this.logger.log(`🧾 Chek rasmi Telegram orqali muvaffaqiyatli yuborildi [tgId: ${telegramId}]`);
        return true;
      } catch (photoErr: any) {
        this.logger.warn(`Chek rasmini yuborishda xatolik (${photoErr.message}), matn shaklida yuborilmoqda...`);
        await this.sendMessageToUser(telegramId, caption, botInstanceId).catch(() => {});
        return false;
      }
    } catch (err: any) {
      this.logger.error(`Foydalanuvchiga (${telegramId}) rasm yuborishda umumiy xatolik: ${err.message}`);
      return false;
    }
  }

  /**
   * Avtomatik tasdiqlash fon vazifasi (2-24 soat oralig'i)
   */
  private startVoteAutoApprover() {
    const autoApproveHours = this.configService.get<number>('bot.autoApproveHours') || 2;
    const approveDelayMs = autoApproveHours * 60 * 60 * 1000;

    this.autoApproveInterval = setInterval(async () => {
      try {
        const thresholdDate = new Date(Date.now() - approveDelayMs);
        const pendingVotes = await this.prisma.vote.findMany({
          where: {
            status: 'PENDING_VERIFICATION',
            createdAt: { lte: thresholdDate },
          },
          include: { user: true, botInstance: true },
        });

        for (const vote of pendingVotes) {
          try {
            const res = await this.walletService.verifyVoteAndCredit(vote.id);
            if (!res.alreadyVerified) {
              const activeBot = vote.botInstanceId ? this.activeBots.get(vote.botInstanceId) : null;
              const sender = activeBot ? activeBot.bot.telegram : this.activeBots.values().next().value?.bot.telegram;

              if (sender) {
                await sender.sendMessage(
                  vote.user.telegramId,
                  BOT_MESSAGES.VOTE_VERIFIED_ALERT(vote.phone, res.rewardAmount, res.user.balance)
                ).catch(() => {});
              }
            }
          } catch (e) {}
        }
      } catch (err) {}
    }, 60000);
  }

  /**
   * Alohida har bir botni doimiy kuzatuvchi va avtomat tiriltiruvchi Supervisor
   */
  private startBotSupervisor() {
    this.supervisorInterval = setInterval(async () => {
      try {
        const expectedBots = await this.prisma.botInstance.findMany({
          where: { isActive: true },
        });

        for (const botRecord of expectedBots) {
          if (!this.activeBots.has(botRecord.id)) {
            this.logger.warn(`🤖 [Bot Supervisor] Bot #${botRecord.id} (${botRecord.name}) to'xtab qolgan. Avtomatik qayta ishga tushirilmoqda...`);
            await this.startBotInstance(botRecord);
          }
        }
      } catch (err: any) {
        this.logger.error(`Bot Supervisor monitoringida xatolik: ${err.message}`);
      }
    }, 60000); // Har 60 soniyada tekshiradi
  }

  /**
   * Har bir alohida bot uchun xabarlar va menyularni sozlash
   */
  private setupBotHandlers(bot: Telegraf, botRecord: any) {
    // Alohida bot uchun xatoliklarni xavfsiz izolyatsiya qilish (boshqa botlarga ta'sir qilmaydi)
    bot.catch((err: any, ctx: Context) => {
      this.logger.error(`[Bot #${botRecord.id} - ${botRecord.name}] Update xatoligi: ${err?.message || err}`);
    });

    // 1. /start komandasi
    bot.start(async (ctx) => {
      try {
        const user = await this.getOrCreateBotUser(ctx, botRecord.id);
        if (!user) return;
        if (user.isBanned) return ctx.reply('⛔️ Siz botdan foydalanishdan chetlashtirilgansiz.');

        await this.prisma.user.update({
          where: { id: user.id },
          data: { step: null, tempData: null },
        });

        const voteReward = botRecord.voteReward || 30000;
        const refBonus = botRecord.refBonus || 5000;
        const startText = BOT_MESSAGES.START(voteReward, refBonus);

        await ctx.reply(startText, {
          parse_mode: 'HTML',
          ...BotKeyboards.mainMenu(user.role === 'ADMIN'),
        });
      } catch (err) {
        this.logger.error(`[Bot #${botRecord.id}] /start xatoligi:`, err);
      }
    });

    // 2. 🗳 Ovoz berish (/vote va tugma)
    const handleVoteTrigger = async (ctx: Context) => {
      try {
        const user = await this.getOrCreateBotUser(ctx, botRecord.id);
        if (!user || user.isBanned) return;

        // 1. MAHALLA MAX OVOZ LIMITINI TEKSHIRISH (Target limit check)
        const currentMahallaVotes = await this.prisma.vote.count({
          where: {
            botInstanceId: botRecord.id,
            status: { in: ['VERIFIED', 'PENDING_VERIFICATION'] },
          },
        });

        const target = botRecord.targetVotes || 5000;
        if (currentMahallaVotes >= target) {
          return ctx.reply(
            `🏁 <b>${botRecord.mahallaName} bo'yicha belgilangan ovozlar limiti to'ldi!</b>\n\n` +
            `📊 <b>Reja:</b> ${target.toLocaleString('uz-UZ')} ta ovoz\n` +
            `✅ <b>Yig'ildi:</b> ${currentMahallaVotes.toLocaleString('uz-UZ')} ta ovoz\n\n` +
            `Hozirda ushbu mahalla bo'yicha yangi ovozlar qabul qilish to'xtatildi. Siz do'stlaringizni taklif qilib har biridan <b>+${(botRecord.refBonus || 5000).toLocaleString('uz-UZ')} so'm</b> bonus olishingiz mumkin!`,
            { parse_mode: 'HTML', ...BotKeyboards.mainMenu(user.role === 'ADMIN') }
          );
        }

        // 2. 10 DAQIQALIK TIRIK SESSIYA BOSHLASH
        const sessionStartedAt = Date.now();
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            step: 'AWAITING_PHONE',
            tempData: JSON.stringify({ sessionStartedAt, botId: botRecord.id }),
          },
        });

        this.startVotingSessionTimer(botRecord.id, user.id, user.telegramId);

        await ctx.reply(
          BOT_MESSAGES.VOTE_PROMPT,
          BotKeyboards.phoneRequestKeyboard()
        );
      } catch (err) {
        this.logger.error(`[Bot #${botRecord.id}] Ovoz berish xatoligi:`, err);
      }
    };
    bot.hears(BOT_BUTTONS.VOTE, handleVoteTrigger);
    bot.command('vote', handleVoteTrigger);

    // 3. 💰 Balans (/balance va tugma)
    const handleBalanceTrigger = async (ctx: Context) => {
      try {
        const user = await this.getOrCreateBotUser(ctx, botRecord.id);
        if (!user) return;

        const referralsCount = await this.prisma.user.count({ where: { referredById: user.id } });
        const votesCount = await this.prisma.vote.count({ where: { userId: user.id, status: 'VERIFIED' } });
        const pendingVotesCount = await this.prisma.vote.count({ where: { userId: user.id, status: 'PENDING_VERIFICATION' } });
        const voteReward = botRecord.voteReward || 30000;

        const balanceText = BOT_MESSAGES.BALANCE(user.balance, referralsCount, votesCount, pendingVotesCount, user.totalWithdrawn, voteReward);

        await ctx.reply(balanceText, {
          parse_mode: 'HTML',
          ...BotKeyboards.balanceInline(),
        });
      } catch (err) {
        this.logger.error(`[Bot #${botRecord.id}] Balans xatoligi:`, err);
      }
    };
    bot.hears(BOT_BUTTONS.BALANCE, handleBalanceTrigger);
    bot.command('balance', handleBalanceTrigger);
    bot.command('profile', handleBalanceTrigger);

    // 4. 📩 Pulni yechib olish (/withdraw va tugma)
    const handleWithdrawTrigger = async (ctx: Context) => {
      try {
        const user = await this.getOrCreateBotUser(ctx, botRecord.id);
        if (!user || user.isBanned) return;

        const minWithdrawal = this.configService.get<number>('bot.minWithdrawal') || 10000;

        if (user.balance < minWithdrawal) {
          return ctx.reply(
            `⚠️ <b>Balansingizda yetarli mablag' mavjud emas!</b>\n\n` +
            `💳 <b>Sizning balansingiz:</b> ${formatSum(user.balance)} so'm\n` +
            `⚠️ <b>Minimal yechish summasi:</b> ${formatSum(minWithdrawal)} so'm\n\n` +
            `Ovoz berish yoki do'stlaringizni taklif qilish orqali balansingizni oshiring!`,
            { parse_mode: 'HTML', ...BotKeyboards.mainMenu(user.role === 'ADMIN') }
          );
        }

        await this.prisma.user.update({
          where: { id: user.id },
          data: { step: 'WITHDRAW_AMOUNT', tempData: JSON.stringify({ method: 'CARD' }) },
        });

        await ctx.reply(
          `💸 <b>PUL YECHIB OLISH BO'LIMI:</b>\n\n` +
          `💳 <b>Sizning balansingiz:</b> ${formatSum(user.balance)} so'm\n` +
          `⚠️ <b>Minimal yechish summasi:</b> ${formatSum(minWithdrawal)} so'm\n\n` +
          `Qancha summa yechmoqchisiz?\n` +
          `Raqam ko'rinishida yozib yuboring (masalan: <code>${formatSum(user.balance)}</code> yoki <code>${formatSum(minWithdrawal)}</code>):`,
          { parse_mode: 'HTML', ...BotKeyboards.cancelKeyboard() }
        );
      } catch (err) {
        this.logger.error(`[Bot #${botRecord.id}] Pul yechish xatoligi:`, err);
      }
    };
    bot.hears(BOT_BUTTONS.WITHDRAW, handleWithdrawTrigger);
    bot.command('withdraw', handleWithdrawTrigger);

    // 5. 🔗 Referal ssilka (/referral va tugma)
    const handleReferralTrigger = async (ctx: Context) => {
      try {
        const user = await this.getOrCreateBotUser(ctx, botRecord.id);
        if (!user) return;

        const refCount = await this.prisma.user.count({ where: { referredById: user.id } });
        const refBonus = botRecord.refBonus || 5000;
        const botUsername = botRecord.botUsername || 'open_budget_bot';
        const refLink = `https://t.me/${botUsername}?start=ref_${user.referralCode}`;

        await ctx.reply(
          BOT_MESSAGES.REFERRAL(refLink, refCount, refBonus),
          BotKeyboards.referralInline(botUsername, user.referralCode)
        );
      } catch (err) {
        this.logger.error(`[Bot #${botRecord.id}] Referal xatoligi:`, err);
      }
    };
    bot.hears(BOT_BUTTONS.REFERRAL, handleReferralTrigger);
    bot.command('referral', handleReferralTrigger);

    // 6. ❌ Bekor qilish (/cancel va tugma)
    const handleCancelTrigger = async (ctx: Context) => {
      try {
        const user = await this.getOrCreateBotUser(ctx, botRecord.id);
        if (!user) return;

        await this.clearAllTimeouts(botRecord.id, user.id);
        await this.prisma.user.update({
          where: { id: user.id },
          data: { step: null, tempData: null },
        });

        await ctx.reply('Amal bekor qilindi.', BotKeyboards.mainMenu(user.role === 'ADMIN'));
      } catch (err) {}
    };
    bot.hears(BOT_BUTTONS.CANCEL, handleCancelTrigger);
    bot.command('cancel', handleCancelTrigger);

    // 7. ℹ️ /help komandasi (Qo'llanma va Qoidalar)
    bot.command('help', async (ctx) => {
      try {
        const user = await this.getOrCreateBotUser(ctx, botRecord.id);
        const reward = botRecord.voteReward || 30000;
        const refBonus = botRecord.refBonus || 5000;

        const helpText = `ℹ️ <b>OCHIQ BUDJET BOTI — QO'LLANMA VA QOIDALAR</b>\n\n` +
          `📍 <b>Mahalla:</b> ${botRecord.mahallaName} (ID: <code>${botRecord.mahallaId}</code>)\n\n` +
          `💰 <b>OVOZ BERISH MUKOFOTI:</b> Har bir tasdiqlangan ovoz uchun <b>${formatSum(reward)} so'm</b> beriladi.\n\n` +
          `👥 <b>REFERAL BONUSI:</b> Shaxsiy havolangiz orqali botga kirgan har bir do'stingiz uchun <b>${formatSum(refBonus)} so'm</b> hisobingizga qo'shiladi.\n\n` +
          `⏱ <b>SMS KOD VAQTI:</b> SMS kod yuborilgach, uni kiritish uchun <b>2 daqiqa (120 soniya)</b> vaqt beriladi.\n\n` +
          `⌛️ <b>SESSIYA MUDDATI:</b> Ovoz berish jarayoni boshlangandan so'ng <b>10 daqiqa</b> ichida yakunlanishi kerak.\n\n` +
          `📌 <b>MUHIM PASPORT QOIDASI:</b> Ochiq Budjet qoidalariga ko'ra, bitta pasport (shaxs) nomiga rasmiylashtirilgan barcha telefon raqamlaridan bir mavsumda faqat <b>1 marta</b> ovoz berish mumkin.\n\n` +
          `💳 <b>PUL YECHISH:</b> Minimal yechish summasi — 10 000 so'm (Uzcard, Humo, Paynet).\n\n` +
          `👑 <b>RASMIY ADMINLAR & BOG'LANISH:</b>\n` +
          `📞 <b>+998 99 065 26 51</b> — @JONIBEKISMOILOV (Jonibek)\n` +
          `📞 <b>+998 94 348 99 00</b> — @Elbek_Muxtorovv (Elbek)\n\n` +
          `Savollaringiz bo'lsa, bemalol adminlarimizga murojaat qilishingiz mumkin.`;

        await ctx.reply(helpText, { parse_mode: 'HTML', ...BotKeyboards.mainMenu(user?.role === 'ADMIN') });
      } catch (e) {}
    });

    // 8. 👑 /admin komandasi
    bot.command('admin', async (ctx) => {
      try {
        const user = await this.getOrCreateBotUser(ctx, botRecord.id);
        if (!user || user.role !== 'ADMIN') return;
        await ctx.reply('👑 Admin boshqaruv paneli: http://localhost:3000/admin-view', BotKeyboards.adminMenuInline());
      } catch (e) {}
    });

    // 7. Kontakt qabul qilish
    bot.on('contact', async (ctx) => {
      try {
        const user = await this.getOrCreateBotUser(ctx, botRecord.id);
        if (!user || user.isBanned) return;
        const contact = ctx.message.contact;
        if (contact && contact.phone_number) {
          await this.handlePhoneInput(ctx, botRecord, user, contact.phone_number);
        }
      } catch (err) {}
    });

    // 8. Callback querylar
    bot.on('callback_query', async (ctx) => {
      try {
        const data = (ctx.callbackQuery as any).data;
        const user = await this.getOrCreateBotUser(ctx, botRecord.id);
        if (!user) return;

        await ctx.answerCbQuery().catch(() => {});

        if (data.startsWith('withdraw_method_')) {
          const method = data.replace('withdraw_method_', '');
          const minWithdrawal = this.configService.get<number>('bot.minWithdrawal') || 10000;

          if (user.balance < minWithdrawal) {
            return ctx.reply(
              `⚠️ Balansingizda yetarli mablag' mavjud emas!\nMinimal yechish summasi: ${minWithdrawal.toLocaleString('uz-UZ')} so'm\nSizning balansingiz: ${user.balance.toLocaleString('uz-UZ')} so'm`
            );
          }

          await this.prisma.user.update({
            where: { id: user.id },
            data: { step: 'WITHDRAW_AMOUNT', tempData: JSON.stringify({ method }) },
          });

          await ctx.reply(
            BOT_MESSAGES.WITHDRAW_ENTER_AMOUNT(method === 'PAYNET' ? 'Paynet' : 'Uzcard/Humo', user.balance, minWithdrawal),
            BotKeyboards.cancelKeyboard()
          );
        } else if (data === 'refresh_balance') {
          const updatedUser = await this.prisma.user.findUnique({ where: { id: user.id } });
          const referralsCount = await this.prisma.user.count({ where: { referredById: user.id } });
          const votesCount = await this.prisma.vote.count({ where: { userId: user.id, status: 'VERIFIED' } });
          const pendingVotesCount = await this.prisma.vote.count({ where: { userId: user.id, status: 'PENDING_VERIFICATION' } });

          try {
            await ctx.editMessageText(
              BOT_MESSAGES.BALANCE(
                updatedUser?.balance || 0,
                referralsCount,
                votesCount,
                pendingVotesCount,
                updatedUser?.totalWithdrawn || 0,
                botRecord.voteReward || 30000
              ),
              {
                parse_mode: 'HTML',
                ...BotKeyboards.balanceInline(),
              }
            );
          } catch (e) {}
        } else if (data === 'resend_sms') {
          const freshUser = await this.prisma.user.findUnique({ where: { id: user.id } });
          if (!freshUser || freshUser.step !== 'AWAITING_SMS_CODE' || !freshUser.tempData) {
            await ctx.answerCbQuery('Ovoz berish sessiyasi faol emas.', { show_alert: true });
            return;
          }

          const tempData = JSON.parse(freshUser.tempData);
          const { phone, smsSentAt, sessionStartedAt } = tempData;

          const elapsedSec = Math.floor((Date.now() - (smsSentAt || 0)) / 1000);
          const cooldownSec = 30;
          if (elapsedSec < cooldownSec) {
            await ctx.answerCbQuery(`⏳ Yangi SMS so'rash uchun yana ${cooldownSec - elapsedSec} soniya kuting!`, { show_alert: true });
            return;
          }

          await ctx.answerCbQuery('🔄 Yangi SMS kod so\'ralmoqda...', { show_alert: false });
          const resendWait = await ctx.reply('⏳ Yangi SMS kod so\'ralmoqda, iltimos kuting...');

          try {
            const res = await this.openBudgetService.requestSmsForVote(phone);
            await ctx.telegram.deleteMessage(ctx.chat.id, resendWait.message_id).catch(() => {});

            if (!res.success) {
              return ctx.reply(`❌ ${res.error || 'Qayta SMS yuborishda xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.'}`);
            }

            const newSmsSentAt = Date.now();
            await this.prisma.user.update({
              where: { id: user.id },
              data: {
                tempData: JSON.stringify({
                  phone,
                  sessionId: res.sessionId,
                  smsSentAt: newSmsSentAt,
                  sessionStartedAt,
                  botId: botRecord.id,
                }),
              },
            });

            // Reset 2-minute timer
            const timeoutKey = `${botRecord.id}_${user.id}`;
            if (this.smsTimeouts.has(timeoutKey)) {
              clearTimeout(this.smsTimeouts.get(timeoutKey));
            }
            const timeoutHandle = setTimeout(async () => {
              try {
                const u = await this.prisma.user.findUnique({ where: { id: user.id } });
                if (u && u.step === 'AWAITING_SMS_CODE') {
                  await this.prisma.user.update({ where: { id: user.id }, data: { step: null, tempData: null } });
                  const activeBot = this.activeBots.get(botRecord.id);
                  if (activeBot) {
                    await activeBot.bot.telegram.sendMessage(
                      user.telegramId,
                      `⏳ SMS kod kiritish vaqti (2 daqiqa) tugadi!\n\nIltimos, qaytadan "🗳 Ovoz berish" tugmasini bosing:`,
                      BotKeyboards.mainMenu(user.role === 'ADMIN')
                    ).catch(() => {});
                  }
                }
              } catch (e) {}
            }, 120000);
            this.smsTimeouts.set(timeoutKey, timeoutHandle);

            await ctx.reply(
              `✅ <b>Yangi SMS kod (+${phone}) raqamiga yuborildi!</b>\n\n⚠️ SMS kodni kiritish uchun sizda 2 daqiqa vaqt bor.\n\nKelgan 6 xonali SMS kodni yozib yuboring:`,
              {
                parse_mode: 'HTML',
                ...BotKeyboards.smsWaitingInline(),
              }
            );
          } catch (err: any) {
            await ctx.telegram.deleteMessage(ctx.chat.id, resendWait.message_id).catch(() => {});
            await ctx.reply('❌ Qayta SMS so\'rashda xatolik yuz berdi.');
          }
        } else if (data === 'cancel_vote' || data === 'cancel_action') {
          await this.clearAllTimeouts(botRecord.id, user.id);
          await this.prisma.user.update({
            where: { id: user.id },
            data: { step: null, tempData: null },
          });
          await ctx.reply('❌ Amal bekor qilindi.', BotKeyboards.mainMenu(user.role === 'ADMIN'));
        }
      } catch (err) {}
    });

    // 9. Matnli xabarlarni qayta ishlash
    bot.on('text', async (ctx) => {
      try {
        const text = ctx.message.text.trim();
        const user = await this.getOrCreateBotUser(ctx, botRecord.id);
        if (!user || user.isBanned) return;

        if (Object.values(BOT_BUTTONS).includes(text)) return;

        if (user.step === 'AWAITING_PHONE') {
          await this.handlePhoneInput(ctx, botRecord, user, text);
          return;
        }

        if (user.step === 'AWAITING_SMS_CODE') {
          await this.handleSmsCodeInput(ctx, botRecord, user, text);
          return;
        }

        if (user.step === 'WITHDRAW_AMOUNT') {
          await this.handleWithdrawAmount(ctx, botRecord, user, text);
          return;
        }

        if (user.step === 'WITHDRAW_ACCOUNT') {
          await this.handleWithdrawAccount(ctx, botRecord, user, text);
          return;
        }

        if (user.step === 'WITHDRAW_CARDHOLDER') {
          await this.handleWithdrawCardholder(ctx, botRecord, user, text);
          return;
        }

        if (/^(\+?998)?[0-9]{9}$/.test(text.replace(/[\s\-\(\)]/g, ''))) {
          await this.handlePhoneInput(ctx, botRecord, user, text);
          return;
        }
      } catch (err) {}
    });
  }

  /**
   * Foydalanuvchi ma'lumotlarini olish / yaratish
   */
  private async getOrCreateBotUser(ctx: Context, botId: number) {
    const from = ctx.from;
    if (!from) return null;

    const telegramId = from.id.toString();
    let user = await this.prisma.user.findUnique({
      where: { telegramId },
      include: { referrer: true, referrals: true },
    });

    if (!user) {
      // Referral kodini 8 xonali unikal qilib generatsiya qilish
      const refCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const adminIds = this.configService.get<string[]>('bot.adminIds') || [];
      const isAdmin = adminIds.includes(telegramId);

      let referredById: number | undefined = undefined;

      // 1. Telegraf startPayload yoki /start matnidan ajratib olish
      let startPayload = (ctx as any).startPayload || '';
      if (!startPayload && (ctx as any).message && (ctx as any).message.text) {
        const parts = (ctx as any).message.text.trim().split(/\s+/);
        if (parts.length > 1 && parts[0] === '/start') {
          startPayload = parts[1];
        }
      }

      if (startPayload) {
        const cleanRef = startPayload.replace(/^ref_/, '').trim();
        const referrer = await this.prisma.user.findFirst({
          where: {
            OR: [
              { referralCode: cleanRef },
              { referralCode: startPayload.trim() },
              { telegramId: cleanRef },
            ],
          },
        });

        if (referrer && referrer.telegramId !== telegramId) {
          referredById = referrer.id;
          this.logger.log(`🔗 Referral aniqlandi: Foydalanuvchi ${telegramId} ni Taklifchi #${referrer.id} (${referrer.firstName}) taklif qildi`);
        }
      }

      try {
        user = await this.prisma.user.create({
          data: {
            telegramId,
            username: from.username,
            firstName: from.first_name,
            lastName: from.last_name,
            referralCode: refCode,
            role: isAdmin ? 'ADMIN' : 'USER',
            referredById,
            botInstanceId: botId,
          },
          include: { referrer: true, referrals: true },
        });

        if (referredById) {
          const refBonusRes = await this.walletService.creditReferralJoinBonus(referredById, user.id);
          if (refBonusRes) {
            const referrer = await this.prisma.user.findUnique({ where: { id: referredById } });
            if (referrer) {
              const activeBot = this.activeBots.get(botId);
              if (activeBot) {
                await activeBot.bot.telegram.sendMessage(
                  referrer.telegramId,
                  `🎉 Sizning referal havolangiz orqali yangi do'stingiz (${user.firstName || 'Foydalanuvchi'}) qo'shildi!\n💰 Hisobingizga +${formatSum(refBonusRes.refBonus)} so'm bonus qo'shildi!\n💳 Hozirgi balansingiz: ${formatSum(refBonusRes.updatedReferrer.balance)} so'm`
                ).catch(() => {});
              }
            }
          }
        }
      } catch (createErr) {
        user = await this.prisma.user.findUnique({
          where: { telegramId },
          include: { referrer: true, referrals: true },
        });
      }
    } else {
      if (user.username !== from.username || user.firstName !== from.first_name) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { username: from.username, firstName: from.first_name, lastName: from.last_name },
          include: { referrer: true, referrals: true },
        }).catch(() => user);
      }
    }

    return user;
  }

  /**
   * GLOBAL DEDUPLICATION + 10-MINUTE SESSION + 2-MINUTE SMS TIMEOUT
   */
  private async handlePhoneInput(ctx: Context, botRecord: any, user: any, rawPhone: string) {
    // 1. 10-Daqiqalik Tirik Sessiya tekshiruvi
    let sessionStartedAt = Date.now();
    if (user.tempData) {
      try {
        const parsed = JSON.parse(user.tempData);
        if (parsed.sessionStartedAt) {
          sessionStartedAt = parsed.sessionStartedAt;
          if (Date.now() - sessionStartedAt > 10 * 60 * 1000) {
            await this.clearAllTimeouts(botRecord.id, user.id);
            await this.prisma.user.update({ where: { id: user.id }, data: { step: null, tempData: null } });
            return ctx.reply('⏱ Ovoz berish sessiyasi vaqti (10 daqiqa) tugadi! Iltimos, "🗳 Ovoz berish" tugmasini bosib qaytadan boshlang.');
          }
        }
      } catch (e) {}
    }

    // 2. Mahalla limiti tekshiruvi
    const currentMahallaVotes = await this.prisma.vote.count({
      where: {
        botInstanceId: botRecord.id,
        status: { in: ['VERIFIED', 'PENDING_VERIFICATION'] },
      },
    });
    const target = botRecord.targetVotes || 5000;
    if (currentMahallaVotes >= target) {
      await this.clearAllTimeouts(botRecord.id, user.id);
      await this.prisma.user.update({ where: { id: user.id }, data: { step: null, tempData: null } });
      return ctx.reply(
        `🏁 <b>${botRecord.mahallaName} bo'yicha belgilangan ovozlar limiti to'ldi!</b>\n\n` +
        `📊 <b>Reja:</b> ${formatSum(target)} ta ovoz\n` +
        `✅ <b>Yig'ildi:</b> ${formatSum(currentMahallaVotes)} ta ovoz\n\n` +
        `Yangi ovozlar qabul qilish to'xtatildi.`,
        { parse_mode: 'HTML', ...BotKeyboards.mainMenu(user.role === 'ADMIN') }
      );
    }

    const { clean9, clean12 } = this.openBudgetService.normalizePhone(rawPhone);

    if (clean9.length !== 9) {
      return ctx.reply('❌ Telefon raqami noto\'g\'ri formatda. Iltimos, 901234567 formatida yuboring:');
    }

    // 3. GLOBAL TEKSHIRUV: Barcha 10-15 ta botlar bo'yicha yagona bazadan tekshirish
    const globalExistingVote = await this.prisma.vote.findFirst({
      where: {
        phone: clean12,
        status: { in: ['VERIFIED', 'PENDING_VERIFICATION'] },
      },
      include: { botInstance: true },
    });

    if (globalExistingVote) {
      return ctx.reply(
        `⚠️ Ushbu telefon raqam (+${clean12}) yoki ushbu pasport nomidagi boshqa raqam orqali allaqachon ovoz berilgan!\n\n📌 <b>Ochiq Budjet qoidasi:</b> Bitta pasport (shaxs) nomiga rasmiylashtirilgan barcha raqamlardan faqat 1 marta ovoz berish mumkin.\n\nIltimos, boshqa fuqaro / pasport nomidagi telefon raqam kiriting (masalan: 901234567):`,
        { parse_mode: 'HTML', ...BotKeyboards.phoneRequestKeyboard() }
      );
    }

    const waitMsg = await ctx.reply(BOT_MESSAGES.WAITING);

    try {
      const res = await this.openBudgetService.requestSmsForVote(clean12);

      if (!res.success) {
        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
        return ctx.reply(`❌ ${res.error || 'Ovoz berishda xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.'}`);
      }

      const smsSentAt = Date.now();

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          phone: clean12,
          step: 'AWAITING_SMS_CODE',
          tempData: JSON.stringify({
            phone: clean12,
            sessionId: res.sessionId,
            smsSentAt,
            sessionStartedAt,
            botId: botRecord.id,
          }),
        },
      });

      // 4. 2 DAQIQALIK (120 soniya) SMS TIMEOUT O'RNATISH
      const timeoutKey = `${botRecord.id}_${user.id}`;
      if (this.smsTimeouts.has(timeoutKey)) {
        clearTimeout(this.smsTimeouts.get(timeoutKey));
      }
      const timeoutHandle = setTimeout(async () => {
        try {
          const freshUser = await this.prisma.user.findUnique({ where: { id: user.id } });
          if (freshUser && freshUser.step === 'AWAITING_SMS_CODE') {
            await this.prisma.user.update({
              where: { id: user.id },
              data: { step: null, tempData: null },
            });
            const activeBot = this.activeBots.get(botRecord.id);
            if (activeBot) {
              await activeBot.bot.telegram.sendMessage(
                user.telegramId,
                `⏳ SMS kod kiritish vaqti (2 daqiqa) tugadi!\n\nIltimos, qaytadan "🗳 Ovoz berish" tugmasini bosing:`,
                BotKeyboards.mainMenu(user.role === 'ADMIN')
              ).catch(() => {});
            }
          }
        } catch (e) {}
      }, 120000); // 2 minut

      this.smsTimeouts.set(timeoutKey, timeoutHandle);

      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await ctx.reply(
        `📩 Telefoningizga (+${clean12}) 6 xonali SMS kod yuborildi!\n\n⚠️ SMS kodni kiritish uchun sizda 2 daqiqa vaqt bor.\n\nIltimos, kelgan SMS kodni quyida yozib yuboring:`,
        {
          parse_mode: 'HTML',
          ...BotKeyboards.smsWaitingInline(),
        }
      );
    } catch (err) {
      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await ctx.reply('❌ Tizimda xatolik yuz berdi. Iltimos keyinroq urinib ko\'ring.');
    }
  }

  /**
   * SMS kod kiritilganda tekshirish (10 minut session + 2 minut SMS timeout)
   */
  private async handleSmsCodeInput(ctx: Context, botRecord: any, user: any, smsCode: string) {
    if (!user.tempData) {
      await this.prisma.user.update({ where: { id: user.id }, data: { step: null } });
      return ctx.reply('Sessiya muddati tugagan. Qaytadan ovoz berish tugmasini bosing.');
    }

    const tempData = JSON.parse(user.tempData);
    const { phone, sessionId, smsSentAt, sessionStartedAt } = tempData;

    // 10-MINUT SESSION TIMEOUT TEKSHIRUVI
    if (sessionStartedAt && Date.now() - sessionStartedAt > 10 * 60 * 1000) {
      await this.clearAllTimeouts(botRecord.id, user.id);
      await this.prisma.user.update({ where: { id: user.id }, data: { step: null, tempData: null } });
      return ctx.reply('⏱ Ovoz berish sessiyasi vaqti (10 daqiqa) tugagan! Iltimos, "🗳 Ovoz berish" tugmasini bosib qaytadan boshlang.');
    }

    // 2-MINUT SMS TIMEOUT TEKSHIRUVI
    const elapsedMs = Date.now() - (smsSentAt || 0);
    if (elapsedMs > 120000) {
      await this.clearAllTimeouts(botRecord.id, user.id);
      await this.prisma.user.update({ where: { id: user.id }, data: { step: null, tempData: null } });
      return ctx.reply('⏳ SMS kod kiritish vaqti (2 daqiqa) tugagan! Iltimos, "🗳 Ovoz berish" tugmasini bosib qaytadan boshlang.');
    }

    const waitMsg = await ctx.reply(BOT_MESSAGES.WAITING);

    try {
      const verifyRes = await this.openBudgetService.verifySmsCode(phone, smsCode, sessionId);

      if (!verifyRes.success) {
        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
        return ctx.reply(`❌ ${verifyRes.error || 'SMS kod noto\'g\'ri kiritildi. Qaytadan kiriting:'}`);
      }

      await this.clearAllTimeouts(botRecord.id, user.id);
      const voteReward = botRecord.voteReward || 30000;

      // Ovozni PENDING_VERIFICATION holatida saqlash
      await this.prisma.vote.create({
        data: {
          userId: user.id,
          botInstanceId: botRecord.id,
          phone,
          status: 'PENDING_VERIFICATION',
          rewardAmount: voteReward,
          smsCode,
          sessionId,
        },
      });

      // Botning joriy ovozlar sonini yangilash
      const updatedBotVotes = await this.prisma.vote.count({
        where: { botInstanceId: botRecord.id, status: { in: ['VERIFIED', 'PENDING_VERIFICATION'] } },
      });
      await this.prisma.botInstance.update({
        where: { id: botRecord.id },
        data: { currentVotes: updatedBotVotes },
      }).catch(() => {});

      await this.prisma.user.update({
        where: { id: user.id },
        data: { step: null, tempData: null },
      });

      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await ctx.reply(
        BOT_MESSAGES.VOTE_SUBMITTED_PENDING(phone, voteReward),
        BotKeyboards.mainMenu(user.role === 'ADMIN')
      );
    } catch (err) {
      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await ctx.reply('❌ Kodni tekshirishda xatolik yuz berdi. Qaytadan urinib ko\'ring.');
    }
  }

  private async clearSmsTimeout(botId: number, userId: number) {
    const key = `${botId}_${userId}`;
    const handle = this.smsTimeouts.get(key);
    if (handle) {
      clearTimeout(handle);
      this.smsTimeouts.delete(key);
    }
  }

  private async handleWithdrawAmount(ctx: Context, botRecord: any, user: any, amountText: string) {
    const amount = parseInt(amountText.replace(/[^0-9]/g, ''), 10);
    const minWithdrawal = this.configService.get<number>('bot.minWithdrawal') || 10000;

    if (isNaN(amount) || amount < minWithdrawal) {
      return ctx.reply(`❌ Noto'g'ri summa! Minimal yechish summasi: ${formatSum(minWithdrawal)} so'm.\n\nIltimos, qaytadan summa kiriting (masalan: 10000 yoki 30000):`);
    }

    if (amount > user.balance) {
      return ctx.reply(`❌ Balansingizda mablag' yetarli emas!\nSizning balansingiz: ${formatSum(user.balance)} so'm.\n\nIltimos, balansingizdan oshmagan summa kiriting:`);
    }

    const tempData = user.tempData ? JSON.parse(user.tempData) : {};
    tempData.amount = amount;

    await this.prisma.user.update({
      where: { id: user.id },
      data: { step: 'WITHDRAW_ACCOUNT', tempData: JSON.stringify(tempData) },
    });

    const promptText = `💳 <b>Plastik karta (Uzcard / Humo) raqamingizni kiriting:</b>\n\n16 ta raqam ko'rinishida yuboring (masalan: <code>8600 1234 5678 9012</code>):`;

    await ctx.reply(promptText, { parse_mode: 'HTML', ...BotKeyboards.cancelKeyboard() });
  }

  private async handleWithdrawAccount(ctx: Context, botRecord: any, user: any, accountText: string) {
    const cleanAccount = accountText.replace(/\s+/g, '');
    const tempData = user.tempData ? JSON.parse(user.tempData) : {};
    const { amount, method } = tempData;

    const isCard = method === 'CARD' || method === 'UZCARD' || method === 'HUMO';

    if (isCard) {
      const cleanDigits = cleanAccount.replace(/[^0-9]/g, '');
      if (cleanDigits.length !== 16) {
        return ctx.reply(
          `❌ Karta raqami noto'g'ri! Karta raqami 16 ta raqamdan iborat bo'lishi kerak.\n\nIltimos, qaytadan yuboring (masalan: 8600 1234 5678 9012):`
        );
      }

      tempData.accountDetails = cleanDigits;

      await this.prisma.user.update({
        where: { id: user.id },
        data: { step: 'WITHDRAW_CARDHOLDER', tempData: JSON.stringify(tempData) },
      });

      return ctx.reply(
        `👤 <b>Karta egasining Ism va Familiyasini kiriting:</b>\n\n(Kartada yoki ilovada ko'rsatilganidek, masalan: <code>ALIYEV VALI</code>):`,
        { parse_mode: 'HTML', ...BotKeyboards.cancelKeyboard() }
      );
    } else {
      // PAYNET
      const cleanPhone = cleanAccount.replace(/[^0-9]/g, '');
      if (cleanPhone.length !== 9 && cleanPhone.length !== 12) {
        return ctx.reply('❌ Noto\'g\'ri telefon raqami! Paynet uchun 901234567 formatida yuboring:');
      }

      try {
        const { updatedUser, withdrawal } = await this.walletService.createWithdrawalRequest({
          userId: user.id,
          amount: amount || 10000,
          paymentMethod: 'PAYNET',
          accountDetails: cleanPhone,
        });

        await this.prisma.user.update({
          where: { id: user.id },
          data: { step: null, tempData: null },
        });

        await ctx.reply(
          `✅ <b>PUL YECHISH SO'ROVI QABUL QILINDI!</b> 🚀\n\n` +
          `💸 <b>Summa:</b> ${formatSum(withdrawal.amount)} so'm\n` +
          `📱 <b>Paynet raqam:</b> +${withdrawal.accountDetails}\n` +
          `⏳ <b>Holat:</b> Kutilmoqda (Admin to'lab chekni yuboradi)\n\n` +
          `Tez orada hisobingizga tushadi!`,
          { parse_mode: 'HTML', ...BotKeyboards.mainMenu(user.role === 'ADMIN') }
        );
      } catch (err: any) {
        await ctx.reply(`❌ Xatolik: ${err.message}`);
      }
    }
  }

  private async handleWithdrawCardholder(ctx: Context, botRecord: any, user: any, cardHolderText: string) {
    const cardHolder = cardHolderText.trim();
    if (cardHolder.length < 3) {
      return ctx.reply('❌ Iltimos, karta egasining to\'liq ism-familiyasini kiriting (masalan: ALIYEV VALI):');
    }

    const tempData = user.tempData ? JSON.parse(user.tempData) : {};
    const { amount, method, accountDetails } = tempData;

    const paymentMethod = method === 'PAYNET' ? 'PAYNET' : (accountDetails.startsWith('9860') ? 'HUMO' : 'UZCARD');

    try {
      const { updatedUser, withdrawal } = await this.walletService.createWithdrawalRequest({
        userId: user.id,
        amount: amount || 10000,
        paymentMethod: paymentMethod as any,
        accountDetails: accountDetails,
        cardHolder: cardHolder,
      });

      await this.prisma.user.update({
        where: { id: user.id },
        data: { step: null, tempData: null },
      });

      const formattedCard = accountDetails.replace(/(\d{4})/g, '$1 ').trim();

      await ctx.reply(
        `✅ <b>PUL YECHISH SO'ROVI QABUL QILINDI!</b> 🚀\n\n` +
        `💸 <b>Summa:</b> ${formatSum(withdrawal.amount)} so'm\n` +
        `💳 <b>Karta:</b> <code>${formattedCard}</code>\n` +
        `👤 <b>Karta egasi:</b> ${cardHolder}\n` +
        `⏳ <b>Holat:</b> Kutilmoqda (Admin to'lov qilib chekni yuboradi)\n\n` +
        `To'lov amalga oshirilgach, to'lov cheki (skrinshoti) ushbu bot orqali sizga yuboriladi!`,
        { parse_mode: 'HTML', ...BotKeyboards.mainMenu(user.role === 'ADMIN') }
      );
    } catch (err: any) {
      await ctx.reply(`❌ Xatolik: ${err.message}`);
    }
  }
}
