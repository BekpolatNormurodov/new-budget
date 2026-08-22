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
import { VoteAutoApproverService } from '../openbudget/vote-auto-approver.service';
import { ProxyManagerService } from '../proxy/proxy-manager.service';
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
  private pendingCaptchaResolvers: Map<string, { resolve: (v: number | null) => void; timeout: any }> = new Map(); // key: "botId_userId"
  private activeCaptchaMessages: Map<string, number> = new Map(); // key: "botId_userId" -> captcha xabarining message_id'si (eski xabarlar to'planib qolmasligi uchun shu xabar tahrirlanadi)
  private activeNoteMessages: Map<string, number> = new Map(); // key: "botId_userId" -> oxirgi "note" (masalan "ro'yxatdan o'tish kerak") xabarining message_id'si - yangisi kelsa eskisi o'chiriladi

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly openBudgetService: OpenBudgetService,
    private readonly walletService: WalletService,
    private readonly voteAutoApproverService: VoteAutoApproverService,
    private readonly proxyManagerService: ProxyManagerService,
  ) {}

  /**
   * Kaptchani foydalanuvchining o'ziga rasm sifatida yuborib, javobini kutadi
   * (avtomatik OCR o'chirilgan - yagona yechim manbai shu). Belgilangan vaqt ichida
   * javob kelmasa, foydalanuvchiga xabar berilib, yangi kaptcha bilan qayta so'raladi.
   */
  private askUserToSolveCaptcha(ctx: Context, botId: number, imageBuffer: Buffer, isRetry: boolean, note?: string): Promise<number | null> {
    const key = `${botId}_${ctx.from.id}`;
    return new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingCaptchaResolvers.get(key)) {
          this.pendingCaptchaResolvers.delete(key);
          this.updateCaptchaCaption(ctx, key, '⏳ <b>Vaqt yetmadi, hechqisi yo\'q!</b>\n\n🔄 Bir zumda yangi captcha tayyor bo\'ladi - uni hisoblab, javobini yozib yuborsangiz kifoya 👇');
          resolve(null);
        }
      }, 120000);

      this.pendingCaptchaResolvers.set(key, { resolve, timeout });

      const caption = isRetry
        ? '❌ <b>Xato javob!</b>\n\n🧮 Yangi captcha keldi — misolni qaytadan hisoblang va javobni yuboring 👇\n<i>(faqat son, masalan: 12)</i>'
        : '🔐 <b>Captchani yeching</b>\n\nRasmdagi misolni hisoblang va javobni yuboring 👇\n<i>(faqat son, masalan: 12)</i>';

      // `note` orqali qo'ng'iroq qiluvchi (openbudget.service.ts) kontekstga oid aniqlashtiruvchi
      // xabar berishi mumkin (masalan "ro'yxatdan o'tish ~10 soniya vaqt oladi") - foydalanuvchi
      // "nega yana captcha so'ralyapti?" deb chalkashib qolmasligi uchun. Buni captcha rasmidan
      // ALOHIDA, mustaqil xabar sifatida yuboramiz. Agar avvalgi "note" xabari hali ekranda
      // bo'lsa, uni o'chirib keyin yangisini yuboramiz - shunda bir necha ketma-ket note
      // xabarlari to'planib qolmaydi (masalan bir necha marta server xatosi bo'lsa).
      (note ? this.showNoteMessage(ctx, key, note) : Promise.resolve())
        .then(() => this.showCaptchaImage(ctx, key, imageBuffer, caption))
        .catch((err) => {
          // Rasm Telegramga yetkazilmadi (masalan IMAGE_PROCESS_FAILED) - bu foydalanuvchi
          // aybi emas, texnik xato. Chaqiruvchiga buni alohida bildiramiz (reject), shunda u
          // "so'ralgan hisoblanadi" deb belgilamasdan, YANGI kaptcha bilan qayta so'rashi mumkin.
          this.logger.warn(`Kaptcha rasmini yuborishda xato: ${err.message}`);
          clearTimeout(timeout);
          this.pendingCaptchaResolvers.delete(key);
          const deliveryError: any = new Error(`Kaptcha rasmini yuborib bo'lmadi: ${err.message}`);
          deliveryError.isCaptchaDeliveryFailure = true;
          reject(deliveryError);
        });
    });
  }

  /**
   * Aniqlashtiruvchi "note" xabarini ko'rsatadi. Agar shu foydalanuvchi uchun oldingi
   * note xabari hali ekranda bo'lsa, avval o'shani o'chirib, keyin yangisini yuboradi -
   * shunda ketma-ket bir necha note (masalan bir necha marta server xatosi bo'lsa)
   * chatga to'planib qolmaydi, faqat ENG SO'NGGISI ko'rinadi.
   */
  private async showNoteMessage(ctx: Context, key: string, note: string): Promise<void> {
    const oldNoteId = this.activeNoteMessages.get(key);
    if (oldNoteId) {
      await ctx.telegram.deleteMessage(ctx.chat.id, oldNoteId).catch(() => {});
      this.activeNoteMessages.delete(key);
    }
    try {
      const sent = await ctx.reply(note, { parse_mode: 'HTML' });
      this.activeNoteMessages.set(key, sent.message_id);
    } catch {
      // Note xabari yuborilmasa ham captcha rasmi baribir yuboriladi - kritik emas.
    }
  }

  /**
   * Captcha rasmini ko'rsatadi. Agar shu foydalanuvchi uchun oldingi captcha xabari hali
   * ekranda bo'lsa, avval O'SHANI O'CHIRIB, keyin YANGI (butunlay alohida) xabar yuboradi -
   * shunda chat eski captcha rasmlariga to'lib ketmaydi va Telegramning "tahrirlangan"
   * belgisi ham chiqmaydi (tahrirlash o'rniga to'liq yangi xabar).
   */
  private async showCaptchaImage(ctx: Context, key: string, imageBuffer: Buffer, caption: string): Promise<void> {
    const existingMsgId = this.activeCaptchaMessages.get(key);
    if (existingMsgId) {
      await ctx.telegram.deleteMessage(ctx.chat.id, existingMsgId).catch(() => {});
      this.activeCaptchaMessages.delete(key);
    }

    const sent = await ctx.replyWithPhoto({ source: imageBuffer, filename: 'captcha.jpg' }, { caption, parse_mode: 'HTML' });
    this.activeCaptchaMessages.set(key, sent.message_id);
  }

  /**
   * Captcha xabarining caption'ini (rasmni o'zgartirmasdan) tahrirlaydi - qisqa holat
   * xabarlari uchun ("✅ Tekshirilmoqda...", "⏳ Vaqt tugadi...") - alohida yangi xabar
   * yubormasdan, xuddi shu rasm ustida holat yangilanadi.
   */
  private updateCaptchaCaption(ctx: Context, key: string, caption: string): void {
    const msgId = this.activeCaptchaMessages.get(key);
    if (!msgId) return;
    ctx.telegram.editMessageCaption(ctx.chat.id, msgId, undefined, caption, { parse_mode: 'HTML' } as any).catch(() => {});
  }

  /**
   * Foydalanuvchi uchun captcha sessiyasi butunlay tugaganda (ovoz/SMS jarayoni
   * yakunlanganda - muvaffaqiyatli yoki xato bilan) chaqiriladi. Oxirgi captcha rasmi
   * va note xabarini ham chatdan butunlay O'CHIRIB tashlaydi (natija - to'g'ri yoki
   * noto'g'ri bo'lishidan qat'iy nazar), shunda jarayon tugagach chatda hech qanday
   * captcha izi qolmaydi va KEYINGI ovoz berish urinishi butunlay toza boshlanadi.
   */
  private clearActiveCaptchaMessage(ctx: Context, botId: number, userId: number): void {
    const key = `${botId}_${userId}`;
    const captchaMsgId = this.activeCaptchaMessages.get(key);
    if (captchaMsgId) {
      ctx.telegram.deleteMessage(ctx.chat.id, captchaMsgId).catch(() => {});
    }
    const noteMsgId = this.activeNoteMessages.get(key);
    if (noteMsgId) {
      ctx.telegram.deleteMessage(ctx.chat.id, noteMsgId).catch(() => {});
    }
    this.activeCaptchaMessages.delete(key);
    this.activeNoteMessages.delete(key);
  }

  /**
   * "⏳ Iltimos kuting..." xabari captcha bosqichi boshlangunga qadar ko'rsatiladi.
   * Captcha interaktiv bo'lgani (foydalanuvchi javob kutilishi, ba'zan bir necha
   * daqiqa davom etishi mumkin) uchun, bu eskirgan "kuting" xabari captcha
   * suhbati ustida osilib qolmasligi kerak - shuning uchun birinchi captcha
   * so'ralishi bilanoq uni o'chirib tashlaymiz.
   */
  private wrapCaptchaResolverWithWaitCleanup(
    ctx: Context,
    botId: number,
    waitMessageId: number,
  ): (imageBuffer: Buffer, isRetry: boolean, note?: string) => Promise<number | null> {
    let waitMsgDeleted = false;
    return async (imageBuffer, isRetry, note) => {
      if (!waitMsgDeleted) {
        waitMsgDeleted = true;
        await ctx.telegram.deleteMessage(ctx.chat.id, waitMessageId).catch(() => {});
      }
      return this.askUserToSolveCaptcha(ctx, botId, imageBuffer, isRetry, note);
    };
  }

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
    await this.launchAllActiveBots();
    this.startVoteAutoApprover();
    this.startBotSupervisor();

    // 🤖 OpenBudget API orqali kutilayotgan ovozlarni real vaqtda avtomatik tekshiruvchi servis
    this.voteAutoApproverService.startLiveVoteChecker(async (botId, telegramId, text) => {
      await this.sendMessageToUser(telegramId, text, botId || undefined);
    });
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
        { command: 'withdraw', description: '💸 Pulni yechib olish' },
        { command: 'referral', description: '🔗 Referal havola (+5 000 so\'m)' },
        { command: 'help', description: 'ℹ️ Yordam va qoidalar' },
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

      // Avval eski eskirgan webhook va to'planib qolgan so'rovlarni tozalash
      await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});

      bot.launch({
        dropPendingUpdates: true,
        allowedUpdates: ['message', 'callback_query'],
      }).catch((err) => {
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
   * Faol bot obyektini ID bo'yicha olish
   */
  public getActiveBot(botId: number) {
    return this.activeBots.get(botId) || null;
  }

  /**
   * Birinchi mavjud faol botni olish
   */
  public getFirstActiveBot() {
    if (this.activeBots.size === 0) return null;
    return this.activeBots.values().next().value || null;
  }

  /**
   * Barcha faol botlar ro'yxatini olish
   */
  public getAllActiveBots() {
    return Array.from(this.activeBots.values());
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
    isRefActive?: boolean;
    adminContact?: string;
    avatarUrl?: string;
    description?: string;
    grantedAmount?: number;
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
        isRefActive: params.isRefActive !== undefined ? Boolean(params.isRefActive) : true,
        adminContact: params.adminContact ? params.adminContact.trim() : null,
        avatarUrl: avatarUrl || '/assets/open_budget_avatar.jpg',
        description: params.description ? params.description.trim() : null,
        grantedAmount: params.grantedAmount ? BigInt(params.grantedAmount) : 0,
        isActive: true,
        status: 'ONLINE',
      },
    });

    const started = await this.startBotInstance(botRecord);

    // Har yangi bot uchun default 2 admin qo'shish (Elbek + Jonibek)
    await this.seedDefaultAdminsForBot(botRecord.id).catch((err) => {
      this.logger.warn(`Default adminlarni qo'shishda xatolik: ${err.message}`);
    });

    return { botRecord, started };
  }

  /**
   * Har bir bot uchun standart 2 ta admin (Elbek + Jonibek) ni upsert qilish
   */
  private async seedDefaultAdminsForBot(botInstanceId: number) {
    const defaultAdmins = [
      {
        telegramId: '8140304652',
        firstName: 'Elbek',
        username: 'Elbek_Muxtorovv',
        phone: '998943489900',
      },
      {
        telegramId: '5957905121',
        firstName: 'Jonibek',
        username: 'JONIBEKISMOILOV',
        phone: '998990652651',
      },
    ];

    for (const admin of defaultAdmins) {
      try {
        await this.prisma.user.upsert({
          where: { telegramId: admin.telegramId },
          update: {
            role: 'ADMIN',
            firstName: admin.firstName,
            username: admin.username,
            phone: admin.phone,
            botInstanceId,
          },
          create: {
            telegramId: admin.telegramId,
            firstName: admin.firstName,
            username: admin.username,
            phone: admin.phone,
            role: 'ADMIN',
            referralCode: `ADM_${admin.telegramId}_${botInstanceId}`,
            botInstanceId,
          },
        });
        this.logger.log(`👑 [Bot #${botInstanceId}] Default admin qo'shildi: ${admin.firstName}`);
      } catch (err: any) {
        this.logger.warn(`[Bot #${botInstanceId}] ${admin.firstName} admin upsert xatoligi: ${err.message}`);
      }
    }
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
        grantedAmount: b.grantedAmount ? Number(b.grantedAmount) : 0,
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
                  BOT_MESSAGES.VOTE_VERIFIED_ALERT(vote.phone, res.rewardAmount, res.user.balance),
                  { parse_mode: 'HTML' }
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

        // Agent ekanligini tekshirish: shu botda TelegramId bilan ro'yxatdan o'tgan agent
        const isAgentOfBot = !!(await this.prisma.agent.findFirst({
          where: { botInstanceId: botRecord.id, telegramId: ctx.from?.id?.toString(), isActive: true },
        }));
        const isAgent = isAgentOfBot || !!user.agentId;

        await ctx.reply(startText, {
          parse_mode: 'HTML',
          ...BotKeyboards.mainMenu(user.role === 'ADMIN', isAgent),
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

        const mahallaName = botRecord.mahallaName || 'Янги боги сурх MFY';
        const voteReward = botRecord.voteReward || 30000;
        const initiativeUuid = botRecord.initiativeUuid || 'b8752aa2-e6da-470c-8a26-52d5b594526a';
        const boardId = botRecord.boardId || 55;
        const mahallaId = botRecord.mahallaId || '055497192014';

        await ctx.reply(
          `🗳 <b>${mahallaName.toUpperCase()} UCHUN OVOZ BERISH</b>\n\n` +
          `💰 <b>Sizga to'lanadigan mukofot:</b> <code>+${formatSum(voteReward)} so'm</code>\n\n` +
          `👇 <b>Ovoz berish uchun quyidagi tugmani bosing:</b>\n` +
          `1️⃣ Telefon raqamingizni yozing.\n` +
          `2️⃣ Rasmdagi 2 ta harfni belgilang.\n` +
          `3️⃣ Kelgan SMS kodni kiriting.\n\n` +
          `⚡️ Ovoz OpenBudget tizimida qabul qilinishi bilan balansingizga avtomatik <b>+${formatSum(voteReward)} so'm</b> o'tkaziladi! 🚀`,
          {
            parse_mode: 'HTML',
            ...BotKeyboards.voteOptionsInline(initiativeUuid, boardId, mahallaId),
          }
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
          { parse_mode: 'HTML', ...BotKeyboards.mainMenu(user.role === 'ADMIN') }
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
        const freshBot = await this.prisma.botInstance.findUnique({ where: { id: botRecord.id } });
        const isRefEnabled = freshBot ? freshBot.isRefActive : (botRecord.isRefActive ?? true);

        if (!isRefEnabled) {
          await ctx.reply(
            '⚠️ <b>Referal tizimi vaqtincha to\'xtatilgan.</b>\n\n' +
            'Hozirda do\'stlarni taklif qilish orqali bonus berish to\'xtatilgan. Siz to\'g\'ridan-to\'g\'ri ovoz berish orqali mukofot olishingiz mumkin.',
            { parse_mode: 'HTML' }
          );
          return;
        }

        const user = await this.getOrCreateBotUser(ctx, botRecord.id);
        if (!user) return;

        const refCount = await this.prisma.user.count({ where: { referredById: user.id } });
        const botUsername =
          freshBot?.botUsername ||
          botRecord.botUsername ||
          this.activeBots.get(botRecord.id)?.info?.username ||
          '';
        const refBonus = freshBot?.refBonus || botRecord.refBonus || 5000;
        const refLink = botUsername ? `https://t.me/${botUsername}?start=ref_${user.referralCode}` : `https://t.me?start=ref_${user.referralCode}`;

        await ctx.reply(
          BOT_MESSAGES.REFERRAL(refLink, refCount, refBonus),
          { parse_mode: 'HTML', ...BotKeyboards.referralInline(botUsername, user.referralCode) }
        );
      } catch (err) {
        this.logger.error(`[Bot #${botRecord.id}] Referal xatoligi:`, err);
      }
    };
    bot.hears(BOT_BUTTONS.REFERRAL, handleReferralTrigger);
    bot.command('referral', handleReferralTrigger);

    // 6. /cancel komandasi (joriy amalni bekor qilish)
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
          `💳 <b>PUL YECHISH:</b> Minimal yechish summasi — 10 000 so'm (Uzcard, Humo).\n\n` +
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

    // 9. 📞 Bog'lanish tugmasi (admin contact)
    bot.hears(BOT_BUTTONS.CONTACT, async (ctx) => {
      try {
        const user = await this.getOrCreateBotUser(ctx, botRecord.id);
        if (!user || user.isBanned) return;

        const freshBot = await this.prisma.botInstance.findUnique({ where: { id: botRecord.id } });
        const contact = freshBot?.adminContact || botRecord.adminContact;

        let contactText = '';
        if (contact) {
          try {
            const parsed = JSON.parse(contact);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const lines = parsed.map((adm: any) => {
                const parts: string[] = [];
                if (adm.name) parts.push(`👤 <b>${adm.name}</b>`);
                if (adm.username) {
                  const cleanU = adm.username.replace(/^@/, '');
                  parts.push(`📲 @${cleanU}`);
                }
                if (adm.phone) {
                  const cleanP = adm.phone.replace(/[^0-9]/g, '');
                  parts.push(`📞 +${cleanP}`);
                }
                return parts.join(' — ');
              });
              contactText = lines.join('\n\n');
            } else {
              contactText = contact;
            }
          } catch {
            contactText = contact;
          }
        }

        if (!contactText) {
          contactText =
            `👤 <b>Elbek Muxtorov</b> — 📲 @Elbek_Muxtorovv — 📞 +998943489900\n\n` +
            `👤 <b>Jonibek Ismoilov</b> — 📲 @JONIBEKISMOILOV — 📞 +998990652651`;
        }

        await ctx.reply(
          `📞 <b>Mas'ul Administratorlar bilan bog'lanish:</b>\n\n${contactText}\n\nIstalgan savolingiz yoki taklifingiz bo'lsa bemalol murojaat qilishingiz mumkin!`,
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        this.logger.error(`[Bot #${botRecord.id}] Contact handler xatoligi:`, err);
      }
    });

    // 10. 💼 Agent Kabineti tugmasi
    bot.hears(BOT_BUTTONS.AGENT_CABINET, async (ctx) => {
      try {
        const user = await this.getOrCreateBotUser(ctx, botRecord.id);
        if (!user || user.isBanned) return;

        const telegramId = ctx.from?.id?.toString();
        if (!telegramId) return;

        // Agent topish: shu botda, shu Telegram ID bilan
        const agent = await this.prisma.agent.findFirst({
          where: {
            botInstanceId: botRecord.id,
            telegramId,
            isActive: true,
          },
          include: {
            botInstance: { select: { botUsername: true, mahallaName: true } },
            _count: { select: { referredUsers: true, votes: true } },
          },
        });

        if (!agent) {
          // Agar agentId bilan bog'langan bo'lsa ham ko'rsatish
          const byAgentId = user.agentId ? await this.prisma.agent.findUnique({
            where: { id: user.agentId },
            include: {
              botInstance: { select: { botUsername: true, mahallaName: true } },
              _count: { select: { referredUsers: true, votes: true } },
            },
          }) : null;

          if (!byAgentId) {
            return ctx.reply(
              `💼 <b>Agent Kabineti</b>\n\n` +
              `❌ Siz hali agent sifatida ro'yxatdan o'tmagansiz.\n\n` +
              `Agent bo'lish uchun administrator bilan bog'laning.`,
              { parse_mode: 'HTML' }
            );
          }
        }

        const agentData = agent || (user.agentId ? await this.prisma.agent.findUnique({
          where: { id: user.agentId },
          include: {
            botInstance: { select: { botUsername: true, mahallaName: true } },
            _count: { select: { referredUsers: true, votes: true } },
          },
        }) : null);

        if (!agentData) return;

        const botUsername = agentData.botInstance?.botUsername || '';
        const referralLink = botUsername
          ? `https://t.me/${botUsername}?start=${agentData.code}`
          : `Kod: ${agentData.code}`;

        const verifiedVotes = await this.prisma.vote.count({
          where: { agentId: agentData.id, status: 'VERIFIED' },
        });

        const cabinetText =
          `💼 <b>Agent Kabineti</b>\n\n` +
          `👤 <b>Ism:</b> ${agentData.name}\n` +
          (agentData.telegramUser ? `📲 <b>Username:</b> @${agentData.telegramUser}\n` : '') +
          (agentData.phone ? `📞 <b>Telefon:</b> +${agentData.phone}\n` : '') +
          `\n🔗 <b>Sizning havola:</b>\n<code>${referralLink}</code>\n\n` +
          `📊 <b>Statistika:</b>\n` +
          `👥 Havolangiz orqali kirganlar: <b>${agentData._count.referredUsers} ta</b>\n` +
          `🗳 Tasdiqlangan ovozlar: <b>${verifiedVotes} ta</b>\n` +
          `🗳 Jami ovozlar: <b>${agentData._count.votes} ta</b>\n\n` +
          `💰 <b>Moliyaviy holat:</b>\n` +
          `💵 Umumiy ishlagan: <b>${formatSum(agentData.totalEarned)} so'm</b>\n` +
          `✅ To'langan: <b>${formatSum(agentData.totalPaid)} so'm</b>\n` +
          `💳 Qoldiq balans: <b>${formatSum(agentData.balance)} so'm</b>\n\n` +
          `📌 To'lov uchun administrator bilan bog'laning.`;

        await ctx.reply(cabinetText, { parse_mode: 'HTML' });
      } catch (err) {
        this.logger.error(`[Bot #${botRecord.id}] Agent kabineti xatoligi:`, err);
      }
    });

    // 11. Kontakt qabul qilish
    bot.on('contact', async (ctx) => {
      try {
        const user = await this.getOrCreateBotUser(ctx, botRecord.id);
        if (!user || user.isBanned) return;
        const contact = ctx.message.contact;
        if (contact && contact.phone_number) {
          // Telegraf navbatdagi yangilanishlarni ushbu handler tugagunicha olib kelmaydi
          // (long-polling ketma-ket ishlaydi). Kaptcha javobini kutish ichkarida uzoq
          // davom etishi mumkin bo'lgani uchun, bloklab qo'ymaslik uchun await qilinmaydi.
          this.handlePhoneInput(ctx, botRecord, user, contact.phone_number).catch((err) => {
            this.logger.error(`[Bot #${botRecord.id}] handlePhoneInput (kontakt) xatosi:`, err);
          });
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
            { parse_mode: 'HTML', ...BotKeyboards.mainMenu(user.role === 'ADMIN') }
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

          // Kaptcha javobini kutish uzoq davom etishi mumkin (foydalanuvchi javobi ham shu
          // callback_query handler orqali emas, keyingi 'text' update orqali keladi). Telegraf
          // navbatdagi update'larni shu handler tugagunicha olib kelmagani uchun (long-polling
          // ketma-ket ishlaydi), bloklab qo'ymaslik uchun bu qismni await qilmasdan orqa fonda
          // ishga tushiramiz.
          (async () => {
            const resendWait = await ctx.reply('⏳ Yangi SMS kod so\'ralmoqda, iltimos kuting...');

            try {
              const res = await this.openBudgetService.requestSmsForVote(
                phone,
                undefined,
                this.wrapCaptchaResolverWithWaitCleanup(ctx, botRecord.id, resendWait.message_id),
              );
              this.clearActiveCaptchaMessage(ctx, botRecord.id, user.id);
              await ctx.telegram.deleteMessage(ctx.chat.id, resendWait.message_id).catch(() => {});

              if (!res.success) {
                await ctx.reply(`❌ ${res.error || 'Qayta SMS yuborishda xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.'}`, { parse_mode: 'HTML' });
                return;
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
              this.clearActiveCaptchaMessage(ctx, botRecord.id, user.id);
              await ctx.telegram.deleteMessage(ctx.chat.id, resendWait.message_id).catch(() => {});
              await ctx.reply('❌ Qayta SMS so\'rashda xatolik yuz berdi.');
            }
          })().catch((err) => {
            this.logger.error(`[Bot #${botRecord.id}] resend_sms xatosi:`, err);
          });
        } else if (data === 'start_vote') {
          await handleVoteTrigger(ctx);
        } else if (data === 'withdraw_menu') {
          await handleWithdrawTrigger(ctx);
        } else if (data === 'referral_link' || data === 'start_ref') {
          await handleReferralTrigger(ctx);
        } else if (data === 'cancel_vote' || data === 'cancel_action') {
          // Eski xabardagi tugma bo'lishi mumkin — agar amal (SMS/ovoz) allaqachon
          // yakunlangan bo'lsa (step bo'sh), hech narsani bekor qilmaymiz.
          const freshUser = await this.prisma.user.findUnique({ where: { id: user.id } });
          if (!freshUser?.step) return;

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

        // Foydalanuvchi kaptcha rasmiga javob kutilayotgan bo'lsa, avval shu javobni ushlaymiz
        const pendingCaptchaKey = `${botRecord.id}_${ctx.from.id}`;
        const pendingCaptcha = this.pendingCaptchaResolvers.get(pendingCaptchaKey);
        if (pendingCaptcha) {
          const match = text.replace(/\s/g, '').match(/-?\d+/);
          const num = match ? parseInt(match[0], 10) : NaN;

          // Foydalanuvchining o'z javob xabarini o'chiramiz - chat faqat bitta "jonli"
          // captcha xabarini ko'rsatib turadi, ortiqcha xabarlar bilan to'lib ketmaydi.
          await ctx.deleteMessage().catch(() => {});

          if (Number.isNaN(num)) {
            // Raqam topilmadi - hozirgi kaptchani bekor qilmasdan, faqat qaytadan so'raymiz
            // (avtomatik OCR o'chirilgani uchun yangi rasmni behuda yubormaymiz).
            this.updateCaptchaCaption(ctx, pendingCaptchaKey, '⚠️ <b>Raqam aniqlanmadi</b>\n\nIltimos, javobni faqat son ko\'rinishida yozib yuboring 👇\n<i>(masalan: 12)</i>');
            return;
          }

          clearTimeout(pendingCaptcha.timeout);
          this.pendingCaptchaResolvers.delete(pendingCaptchaKey);
          this.updateCaptchaCaption(ctx, pendingCaptchaKey, '✅ <b>Qabul qilindi!</b>\n\n⏳ Tekshirilmoqda...');
          pendingCaptcha.resolve(num);
          return;
        }

        const user = await this.getOrCreateBotUser(ctx, botRecord.id);
        if (!user || user.isBanned) return;

        if (Object.values(BOT_BUTTONS).includes(text)) return;

        if (user.step === 'AWAITING_PHONE') {
          // Telegraf navbatdagi update'larni bu handler tugagunicha olib kelmaydi (long-polling
          // ketma-ket ishlaydi). Kaptcha javobini kutish shu ichida sodir bo'lgani uchun,
          // shu javobning o'zi keyingi update sifatida kelishi mumkin - shuning uchun await
          // qilinmaydi (aks holda o'zaro bloklanib qoladi / deadlock).
          this.handlePhoneInput(ctx, botRecord, user, text).catch((err) => {
            this.logger.error(`[Bot #${botRecord.id}] handlePhoneInput xatosi:`, err);
          });
          return;
        }

        if (user.step === 'AWAITING_SMS_CODE') {
          this.handleSmsCodeInput(ctx, botRecord, user, text).catch((err) => {
            this.logger.error(`[Bot #${botRecord.id}] handleSmsCodeInput xatosi:`, err);
          });
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
          this.handlePhoneInput(ctx, botRecord, user, text).catch((err) => {
            this.logger.error(`[Bot #${botRecord.id}] handlePhoneInput xatosi:`, err);
          });
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

      const botObj = await this.prisma.botInstance.findUnique({ where: { id: botId } });
      const isRefActive = botObj ? (botObj.isRefActive ?? true) : true;

      let agentId: number | undefined = undefined;

      if (startPayload) {
        // Agent kodi tekshiruvi (ag_ bilan boshlanadi yoki agent jadvalida mavjud)
        const agentCode = startPayload.trim();
        if (agentCode) {
          const agentRecord = await this.prisma.agent.findUnique({
            where: { code: agentCode },
          });
          if (agentRecord && agentRecord.botInstanceId === botId && agentRecord.isActive) {
            agentId = agentRecord.id;
            this.logger.log(`🤝 Agent referral aniqlandi: Foydalanuvchi ${telegramId} → Agent #${agentRecord.id} (${agentRecord.name}) [Kod: ${agentCode}]`);
          }
        }

        // Foydalanuvchi referral tekshiruvi (ref_ prefiksi bilan)
        if (!agentId && isRefActive) {
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
            agentId: agentId || null,
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

        // Agent referral orqali kirgan bo'lsa – agent statistikasini yozib qo'yamiz (ixtiyoriy log)
        if (agentId) {
          this.logger.log(`🤝 Yangi foydalanuvchi agent havolasi orqali qo'shildi: User #${user.id} → Agent #${agentId}`);
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
      const mahalla = globalExistingVote.botInstance?.mahallaName || 'boshqa';
      return ctx.reply(
        `⚠️ <b>Ushbu telefon raqam (+${clean12}) orqali allaqachon "${mahalla}" mahallasiga ovoz berilgan!</b>\n\n📌 <b>Ochiq Budjet qoidasi:</b> Bitta fuqaro (pasport) yoki telefon raqam nomidan bir mavsumda faqat 1 marta ovoz berish mumkin.\n\nSiz boshqa yaqinlaringiz nomidagi telefon raqamlaridan ovoz berib pul ishlashingiz mumkin!`,
        { parse_mode: 'HTML', ...BotKeyboards.phoneRequestKeyboard() }
      );
    }

    const waitMsg = await ctx.reply(BOT_MESSAGES.WAITING, { parse_mode: 'HTML' });

    try {
      const res = await this.openBudgetService.requestSmsForVote(
        clean12,
        undefined,
        this.wrapCaptchaResolverWithWaitCleanup(ctx, botRecord.id, waitMsg.message_id),
      );
      this.clearActiveCaptchaMessage(ctx, botRecord.id, user.id);

      if (!res.success) {
        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

        // ⚡ Administratorga (Xurshid) zudlik bilan nosozlik xabarnomasini yuborish
        const errMsg = res.error || 'SMS kod yuborilmadi';
        const adminAlertText = `⚠️ <b>[BOT XATOLIK SIGNALI]</b>\n\n👤 <b>Foydalanuvchi:</b> ${user.firstName || 'Noma\'lum'} (@${user.username || 'yo\'q'})\n📱 <b>Telefon:</b> +${clean12}\n🤖 <b>Bot:</b> @${botRecord.botUsername || botRecord.id}\n❌ <b>Xatolik:</b> <code>${errMsg}</code>\n⏰ <b>Vaqt:</b> ${new Date().toLocaleTimeString('uz-UZ')}`;
        
        // 2053690211 - Xurshid Ismoilov Telegram ID
        try {
          const activeBot = this.activeBots.get(botRecord.id);
          if (activeBot) {
            await activeBot.bot.telegram.sendMessage('2053690211', adminAlertText, { parse_mode: 'HTML' }).catch(() => {});
          }
        } catch (e) {}

        return ctx.reply(
          errMsg.startsWith('⚠️') || errMsg.startsWith('❌') || errMsg.startsWith('⏳') || errMsg.startsWith('🏁') ? errMsg : `❌ ${errMsg}`,
          { parse_mode: 'HTML', ...BotKeyboards.mainMenu(user.role === 'ADMIN') }
        );
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
      this.clearActiveCaptchaMessage(ctx, botRecord.id, user.id);
      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await ctx.reply('❌ Nimadir xato ketdi. Iltimos, birozdan so\'ng qaytadan urinib ko\'ring.');
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

    const waitMsg = await ctx.reply(BOT_MESSAGES.WAITING, { parse_mode: 'HTML' });

    try {
      const verifyRes = await this.openBudgetService.verifySmsCode(phone, smsCode, sessionId);

      if (!verifyRes.success) {
        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

        // Agar sessiya eskirgan yoki o'zgargan bo'lsa -> avtomatik yangi toza SMS yuborish
        if (verifyRes.sessionExpired) {
          const resendWait = await ctx.reply(BOT_MESSAGES.WAITING, { parse_mode: 'HTML' });
          try {
            const newSms = await this.openBudgetService.requestSmsForVote(
              phone,
              undefined,
              this.wrapCaptchaResolverWithWaitCleanup(ctx, botRecord.id, resendWait.message_id),
            );
            this.clearActiveCaptchaMessage(ctx, botRecord.id, user.id);
            await ctx.telegram.deleteMessage(ctx.chat.id, resendWait.message_id).catch(() => {});

            if (newSms.success) {
              const newSmsSentAt = Date.now();
              await this.prisma.user.update({
                where: { id: user.id },
                data: {
                  tempData: JSON.stringify({
                    phone,
                    sessionId: newSms.sessionId,
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

              return ctx.reply(
                `🔄 Yangi SMS kod (+${phone}) raqamiga yuborildi!\n\nIltimos, yangi kelgan SMS kodni kiriting:`,
                {
                  parse_mode: 'HTML',
                  ...BotKeyboards.smsWaitingInline(),
                }
              );
            }
          } catch (e) {
            this.clearActiveCaptchaMessage(ctx, botRecord.id, user.id);
            await ctx.telegram.deleteMessage(ctx.chat.id, resendWait.message_id).catch(() => {});
          }
        }

        return ctx.reply(
          `❌ ${verifyRes.error || 'SMS kod noto\'g\'ri kiritildi. Qaytadan kiriting:'}`,
          {
            parse_mode: 'HTML',
            ...BotKeyboards.smsWaitingInline(),
          }
        );
      }

      await this.clearAllTimeouts(botRecord.id, user.id);

      // GLOBAL DEDUPLICATION DOUBLE-CHECK: Boshqa botda allaqachon ovoz berilganmi?
      const existingAnywhere = await this.prisma.vote.findFirst({
        where: {
          phone,
          status: { in: ['VERIFIED', 'PENDING_VERIFICATION'] },
        },
        include: { botInstance: true },
      });

      if (existingAnywhere) {
        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
        await this.prisma.user.update({
          where: { id: user.id },
          data: { step: null, tempData: null },
        });
        return ctx.reply(
          `⚠️ <b>Ushbu telefon raqam (+${phone}) orqali allaqachon ${existingAnywhere.botInstance?.mahallaName || 'boshqa'} mahallasiga ovoz berilgan!</b>\n\n📌 <b>Ochiq Budjet qoidasi:</b> Bitta telefon raqam yoki fuqaro nomidan bir mavsumda faqat 1 marta ovoz berish mumkin.\n\nSiz boshqa yaqinlaringiz raqamlaridan ovoz berib pul ishlashingiz mumkin!`,
          { parse_mode: 'HTML', ...BotKeyboards.mainMenu(user.role === 'ADMIN') }
        );
      }

      const voteReward = botRecord.voteReward || 30000;

      // Agar foydalanuvchi Agent referali orqali kirgan bo'lsa, agent ma'lumotlarini olish
      let agentIdToAssign: number | null = null;
      let agentRewardToAssign = 0;
      if (user.agentId) {
        const agentRec = await this.prisma.agent.findUnique({ where: { id: user.agentId } });
        if (agentRec && agentRec.isActive) {
          agentIdToAssign = agentRec.id;
          agentRewardToAssign = agentRec.rewardPerVote || 5000;
        }
      }

      // Ovozni PENDING_VERIFICATION holatida va JWT Token bilan saqlash
      await this.prisma.vote.create({
        data: {
          userId: user.id,
          botInstanceId: botRecord.id,
          agentId: agentIdToAssign,
          agentReward: agentRewardToAssign,
          phone,
          status: 'PENDING_VERIFICATION',
          rewardAmount: voteReward,
          smsCode,
          sessionId,
          jwtToken: verifyRes.accessToken || null,
          refreshToken: verifyRes.refreshToken || null,
        },
      });

      // Agar JWT token qaytgan bo'lsa, foydalanuvchi profiliga ham bog'lab qo'yish
      if (verifyRes.accessToken) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            openBudgetJwt: verifyRes.accessToken,
            openBudgetRefresh: verifyRes.refreshToken || null,
          },
        }).catch(() => {});
      }

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
        { parse_mode: 'HTML', ...BotKeyboards.mainMenu(user.role === 'ADMIN') }
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

    await ctx.reply(promptText, { parse_mode: 'HTML', ...BotKeyboards.mainMenu(user.role === 'ADMIN') });
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
        { parse_mode: 'HTML', ...BotKeyboards.mainMenu(user.role === 'ADMIN') }
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
