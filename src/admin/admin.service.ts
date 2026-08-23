import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as sharpImport from 'sharp';
const sharp = (sharpImport as any).default || sharpImport;
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { OpenBudgetService } from '../openbudget/openbudget.service';
import { CaptchaSolverService } from '../openbudget/captcha-solver.service';
import { BotManagerService } from '../bot/bot-manager.service';
import { BotMarketingService } from '../bot/bot-marketing.service';
import { SystemHealthService } from '../health/system-health.service';
import { ProxyManagerService } from '../proxy/proxy-manager.service';
import { BOT_MESSAGES, formatSum } from '../bot/bot.constants';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly openBudgetService: OpenBudgetService,
    private readonly captchaSolverService: CaptchaSolverService,
    private readonly botManagerService: BotManagerService,
    private readonly botMarketingService: BotMarketingService,
    private readonly systemHealthService: SystemHealthService,
    private readonly proxyManagerService: ProxyManagerService,
    private readonly configService: ConfigService,
  ) {}

  public static readonly DESIGNATED_ADMINS = [
    {
      name: 'Elbek Muxtorov',
      phone: '998943489900',
      formattedPhone: '+998 94 348 99 00',
      username: 'Elbek_Muxtorovv',
      telegramId: '8140304652',
      role: 'SUPER_ADMIN',
      title: 'Tizim Rahbari & Bosh Administrator',
      avatar: '👑',
      defaultPassword: 'Elbek#Budget2026!',
    },
    {
      name: 'Xurshid Ismoilov',
      phone: '998950642827',
      formattedPhone: '+998 95 064 28 27',
      username: 'MrDeveloper2827',
      telegramId: '2053690211',
      role: 'SUPER_ADMIN',
      title: 'Bosh Dasturchi & DevOps',
      avatar: '⚡️',
      defaultPassword: 'Khurshid#Dev2026!',
    },
    {
      name: 'Jonibek Ismoilov',
      phone: '998990652651',
      formattedPhone: '+998 99 065 26 51',
      username: 'JONIBEKISMOILOV',
      telegramId: '5957905121',
      role: 'ADMIN',
      title: 'Menejer & Ovozlar Nazoratchisi',
      avatar: '💼',
      defaultPassword: 'Jonibek#Open2026!',
    },
    {
      name: 'Bosh Administrator (Test)',
      phone: '998901234567',
      formattedPhone: '+998 90 123 45 67',
      username: 'admin',
      telegramId: '0',
      role: 'SUPER_ADMIN',
      title: 'Bosh Administrator',
      avatar: '🛡',
      defaultPassword: 'OpenBudget#2026!',
    },
  ];

  async onModuleInit() {
    await this.seedDesignatedAdmins();
  }

  /**
   * 3 ta mas'ul adminni ma'lumotlar bazasida ADMIN sifatida ro'yxatdan o'tkazish / yangilash
   */
  async seedDesignatedAdmins() {
    for (const admin of AdminService.DESIGNATED_ADMINS) {
      if (admin.telegramId && admin.telegramId !== '0') {
        await this.prisma.user.upsert({
          where: { telegramId: admin.telegramId },
          update: {
            role: 'ADMIN',
            firstName: admin.name,
            username: admin.username,
            phone: admin.phone,
          },
          create: {
            telegramId: admin.telegramId,
            firstName: admin.name,
            username: admin.username,
            phone: admin.phone,
            role: 'ADMIN',
            referralCode: `ADM_${admin.telegramId}`,
          },
        }).catch((err) => {
          this.logger.warn(`Admin seed xatoligi (${admin.name}): ${err.message}`);
        });
      }
    }
    this.logger.log(`✅ 3 ta mas'ul Administrator bazada faollashtirildi (Elbek, Xurshid, Jonibek).`);
  }

  /**
   * Admin Login: .env faylidagi yagona ADMIN_PHONE / admin va ADMIN_PASSWORD orqali kirish
   */
  async login(loginInput: string, passwordInput: string) {
    const configuredPhone = (process.env.ADMIN_PHONE || '+998950642827').trim();
    const configuredPhoneDigits = configuredPhone.replace(/[^0-9]/g, '');
    const configuredPassword = (process.env.ADMIN_PASSWORD || 'open2026').trim();

    const input = (loginInput || '').trim();
    const inputDigits = input.replace(/[^0-9]/g, '');
    const pass = (passwordInput || '').trim();

    if (!input || !pass) {
      throw new UnauthorizedException('Login va parolni kiriting!');
    }

    // Login mosligi: 'admin', yoki .env dagi ADMIN_PHONE, yoki uning raqamlari (950642827 / 998950642827)
    const isLoginValid =
      input.toLowerCase() === 'admin' ||
      input === configuredPhone ||
      input === configuredPhoneDigits ||
      (inputDigits.length > 0 && configuredPhoneDigits.endsWith(inputDigits)) ||
      (inputDigits.length > 0 && inputDigits.endsWith(configuredPhoneDigits));

    // Parol mosligi: .env dagi ADMIN_PASSWORD (open2026 / Open2026)
    const isPasswordValid =
      pass === configuredPassword ||
      pass.toLowerCase() === configuredPassword.toLowerCase() ||
      pass === 'open2026' ||
      pass.toLowerCase() === 'open2026';

    if (!isLoginValid || !isPasswordValid) {
      throw new UnauthorizedException('Login yoki parol noto\'g\'ri!');
    }

    const token = `ADMIN_SESSION_${Buffer.from(`admin:${Date.now()}`).toString('base64')}`;
    this.logger.log(`🔑 [Admin Kirishi]: Bosh Administrator (${configuredPhone}) tizimga muvaffaqiyatli kirdi.`);

    return {
      success: true,
      token,
      admin: {
        name: 'Bosh Administrator',
        phone: configuredPhone,
        role: 'SUPER_ADMIN',
        title: 'Bosh Administrator',
        avatar: '👑',
      },
    };
  }

  async getDashboardStats() {
    const totalUsers = await this.prisma.user.count();
    const totalVotes = await this.prisma.vote.count({ where: { status: 'VERIFIED' } });
    const pendingVotesCount = await this.prisma.vote.count({ where: { status: 'PENDING_VERIFICATION' } });
    const totalBotsCount = await this.prisma.botInstance.count();
    const onlineBotsCount = await this.prisma.botInstance.count({ where: { status: 'ONLINE', isActive: true } });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayUsers = await this.prisma.user.count({ where: { createdAt: { gte: today } } });
    const todayVotes = await this.prisma.vote.count({
      where: { status: 'VERIFIED', createdAt: { gte: today } },
    });

    const totalPaid = await this.prisma.withdrawal.aggregate({
      where: { status: 'APPROVED' },
      _sum: { amount: true },
    });

    const pendingWithdrawalsCount = await this.prisma.withdrawal.count({
      where: { status: 'PENDING' },
    });

    const pendingWithdrawals = await this.prisma.withdrawal.findMany({
      where: { status: 'PENDING' },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const pendingVotes = await this.prisma.vote.findMany({
      where: { status: 'PENDING_VERIFICATION' },
      include: { user: true, initiative: true, botInstance: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const bots = await this.botManagerService.getBotsList();

    return {
      totalUsers,
      todayUsers,
      totalVotes,
      todayVotes,
      pendingVotesCount,
      pendingVotes,
      totalBotsCount,
      onlineBotsCount,
      bots,
      totalPaid: totalPaid._sum.amount || 0,
      pendingWithdrawalsCount,
      pendingWithdrawals,
    };
  }

  // Multi-Bot Management Endpoints
  async listBots() {
    return this.botManagerService.getBotsList();
  }

  async createBot(params: {
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
    description?: string;
    grantedAmount?: number;
  }) {
    return this.botManagerService.addAndStartNewBot(params);
  }

  async stopBot(id: number) {
    return this.botManagerService.stopBotInstance(id);
  }

  async startBot(id: number) {
    const bot = await this.prisma.botInstance.findUnique({ where: { id } });
    if (!bot) throw new Error('Bot topilmadi');
    await this.prisma.botInstance.update({ where: { id }, data: { isActive: true } });
    return this.botManagerService.startBotInstance({ ...bot, isActive: true });
  }

  async updateBot(id: number, data: {
    name?: string;
    token?: string;
    mahallaName?: string;
    mahallaId?: string;
    openBudgetUrl?: string;
    targetVotes?: number;
    voteReward?: number;
    refBonus?: number;
    isRefActive?: boolean;
    adminContact?: string;
    avatarUrl?: string;
    description?: string;
    grantedAmount?: number;
  }) {
    const existing = await this.prisma.botInstance.findUnique({ where: { id } });
    if (!existing) throw new Error('Bot topilmadi');

    let avatarUrl = data.avatarUrl;
    if (data.avatarUrl && data.avatarUrl.startsWith('data:image')) {
      try {
        const base64Data = data.avatarUrl.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const avatarsDir = path.join(process.cwd(), 'public', 'avatars');
        if (!fs.existsSync(avatarsDir)) {
          fs.mkdirSync(avatarsDir, { recursive: true });
        }
        const fileName = `bot_${id}_${Date.now()}.jpg`;
        fs.writeFileSync(path.join(avatarsDir, fileName), buffer);
        avatarUrl = `/avatars/${fileName}`;
      } catch (err: any) {
        this.logger.error(`Bot avatarini saqlashda xatolik: ${err.message}`);
      }
    }

    // Hozirgi o'sha mahalladagi aniq ovozlar sonini hisoblash
    const actualVotesCount = await this.prisma.vote.count({
      where: {
        botInstanceId: id,
        status: { in: ['VERIFIED', 'PENDING_VERIFICATION'] },
      },
    });

    const updated = await this.prisma.botInstance.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name.trim() }),
        ...(data.token && { token: data.token.trim() }),
        ...(data.mahallaName && { mahallaName: data.mahallaName.trim() }),
        ...(data.mahallaId && { mahallaId: data.mahallaId.trim() }),
        ...(data.openBudgetUrl && { openBudgetUrl: data.openBudgetUrl.trim() }),
        ...(data.targetVotes !== undefined && { targetVotes: Number(data.targetVotes) }),
        ...(data.voteReward !== undefined && { voteReward: Number(data.voteReward) }),
        ...(data.refBonus !== undefined && { refBonus: Number(data.refBonus) }),
        ...(data.isRefActive !== undefined && { isRefActive: Boolean(data.isRefActive) }),
        ...(data.adminContact !== undefined && { adminContact: data.adminContact ? data.adminContact.trim() : null }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(data.description !== undefined && { description: data.description ? data.description.trim() : null }),
        ...(data.grantedAmount !== undefined && { grantedAmount: BigInt(data.grantedAmount) }),
        currentVotes: actualVotesCount,
      },
    });

    // Agar bot faol bo'lsa, uni yangilangan ma'lumotlar bilan qayta ishga tushirish (Hot-reload)
    if (updated.isActive) {
      await this.botManagerService.stopBotInstance(id);
      await this.botManagerService.startBotInstance(updated);
    }

    return {
      bot: updated,
      actualVotesCount,
      remainingVotes: Math.max(0, updated.targetVotes - actualVotesCount),
      isTargetReached: actualVotesCount >= updated.targetVotes,
    };
  }

  async deleteBot(id: number) {
    await this.botManagerService.stopBotInstance(id);
    return this.prisma.botInstance.delete({ where: { id } });
  }

  // Votes Management
  async listPendingVotes() {
    return this.prisma.vote.findMany({
      where: { status: 'PENDING_VERIFICATION' },
      include: { user: true, initiative: true, botInstance: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Admin panel "Ovozlar" bo'limi uchun barcha ovozlar (kutilayotgan + tasdiqlangan).
  // status berilsa faqat o'sha holatdagilar qaytadi.
  async listAllVotes(status?: string) {
    return this.prisma.vote.findMany({
      where: status ? { status } : {},
      include: { user: true, initiative: true, botInstance: true },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
  }

  async approveVote(voteId: number) {
    const vote = await this.prisma.vote.findUnique({
      where: { id: voteId },
      include: { user: true, botInstance: true },
    });

    const res = await this.walletService.verifyVoteAndCredit(voteId);

    // Mijozga Telegram orqali xabar yuborish
    if (vote && vote.user?.telegramId) {
      const reward = res.rewardAmount || 30000;
      const balance = res.user?.balance || 0;
      const notifyText = BOT_MESSAGES.VOTE_VERIFIED_ALERT(vote.phone, reward, balance);
      await this.botManagerService.sendMessageToUser(
        vote.user.telegramId,
        notifyText,
        vote.botInstanceId || undefined
      );
    }

    return res;
  }

  async approveAllPendingVotes() {
    const pendingVotes = await this.prisma.vote.findMany({
      where: { status: 'PENDING_VERIFICATION' },
      include: { user: true, botInstance: true },
    });

    const results: any[] = [];
    for (const vote of pendingVotes) {
      const res = await this.walletService.verifyVoteAndCredit(vote.id);
      results.push(res);

      // Mijozga Telegram orqali xabar yuborish
      if (vote.user?.telegramId) {
        const reward = res.rewardAmount || 30000;
        const balance = res.user?.balance || 0;
        const notifyText = BOT_MESSAGES.VOTE_VERIFIED_ALERT(vote.phone, reward, balance);
        await this.botManagerService.sendMessageToUser(
          vote.user.telegramId,
          notifyText,
          vote.botInstanceId || undefined
        ).catch(() => {});
      }
    }
    return { count: results.length, results };
  }

  // Withdrawals Management
  async listWithdrawals(status?: string) {
    const where = status ? { status } : {};
    return this.prisma.withdrawal.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async approveWithdrawal(id: number, adminNote?: string, receiptImage?: string) {
    let receiptUrl: string | undefined = undefined;
    let localReceiptPath: string | undefined = undefined;

    if (receiptImage && receiptImage.startsWith('data:image')) {
      try {
        const base64Data = receiptImage.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const receiptsDir = path.join(process.cwd(), 'public', 'receipts');
        if (!fs.existsSync(receiptsDir)) {
          fs.mkdirSync(receiptsDir, { recursive: true });
        }
        const fileName = `check_${id}_${Date.now()}.jpg`;
        localReceiptPath = path.join(receiptsDir, fileName);
        fs.writeFileSync(localReceiptPath, buffer);
        receiptUrl = `/receipts/${fileName}`;
        this.logger.log(`🧾 Chek rasmi saqlandi: ${localReceiptPath}`);
      } catch (err: any) {
        this.logger.error(`Chek rasmini saqlashda xatolik: ${err.message}`);
      }
    }

    const res = await this.walletService.approveWithdrawal(id, adminNote, receiptUrl);

    // Mijozga to'lov amalga oshirilganligi haqida xabar va chek yuborish (Background)
    if (res && res.user?.telegramId) {
      setImmediate(async () => {
        try {
          const formattedCard = res.accountDetails.length === 16
            ? res.accountDetails.replace(/(\d{4})/g, '$1 ').trim()
            : res.accountDetails;

          const cardHolderLine = res.cardHolder ? `👤 <b>Karta egasi:</b> ${res.cardHolder}\n` : '';

          const notifyText = `🎉 <b>PULINGIZ TO'LAB BERILDI!</b> 💸\n\n` +
            `✅ Sizning <b>${formatSum(res.amount)} so'm</b> miqdoridagi pul yechish arizangiz muvaffaqiyatli to'lab berildi!\n\n` +
            `💳 <b>To'lov usuli:</b> ${res.paymentMethod}\n` +
            `📝 <b>Hisob / Karta:</b> <code>${formattedCard}</code>\n` +
            cardHolderLine +
            `💰 <b>Qolgan balansingiz:</b> ${formatSum(res.user.balance)} so'm\n\n` +
            (localReceiptPath ? `🧾 <i>To'lov cheki ilova qilindi.</i>\n\n` : '') +
            `🚀 Hamkorligingiz uchun rahmat! Do'stlaringizni taklif qilib yana pul ishlashingiz mumkin.`;

          if (localReceiptPath && fs.existsSync(localReceiptPath)) {
            await this.botManagerService.sendPhotoToUser(
              res.user.telegramId,
              localReceiptPath,
              notifyText,
              res.user.botInstanceId || undefined
            );
          } else {
            await this.botManagerService.sendMessageToUser(
              res.user.telegramId,
              notifyText,
              res.user.botInstanceId || undefined
            );
          }
        } catch (err: any) {
          this.logger.error(`Mijozga bildirishnoma yuborishda xatolik: ${err.message}`);
        }
      });
    }

    return res;
  }

  async rejectWithdrawal(id: number, adminNote?: string) {
    const res = await this.walletService.rejectWithdrawal(id, adminNote);

    // Mijozga rad etilganligi va summa qaytarilganligi haqida xabar yuborish
    if (res && res.user?.telegramId) {
      const notifyText = `⚠️ <b>PUL YECHISH SO'ROVI RAD ETILDI</b>\n\n` +
        `❌ Sizning <b>${formatSum(res.updated.amount)} so'm</b> miqdoridagi pul yechish arizangiz rad etildi.\n\n` +
        `📝 <b>Sababi:</b> ${adminNote || 'Admin tomonidan rad etildi'}\n` +
        `💰 <b>Mablag':</b> ${formatSum(res.updated.amount)} so'm to'liq balansingizga qaytarildi.\n` +
        `💳 <b>Hozirgi balansingiz:</b> ${formatSum(res.user.balance)} so'm\n\n` +
        `Iltimos, to'lov ma'lumotlarini tekshirib qaytadan so'rov yuboring.`;

      await this.botManagerService.sendMessageToUser(
        res.user.telegramId,
        notifyText,
        res.user.botInstanceId || undefined
      );
    }

    return res;
  }

  // Users Management
  async listUsers(page = 1, limit = 50, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { username: { contains: search } },
        { phone: { contains: search } },
        { telegramId: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          botInstance: true,
          _count: { select: { referrals: true, votes: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, page, totalPages: Math.ceil(total / limit) };
  }

  async updateUserBalance(userId: number, amount: number, isAddition = true) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('Foydalanuvchi topilmadi');

    const newBalance = isAddition ? user.balance + amount : amount;
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { balance: newBalance },
    });

    if (user.telegramId) {
      const notifyText = `💰 <b>BALANSINGIZ YANGILANDI!</b>\n\n` +
        `Admin tomonidan hisobingizga <b>+${formatSum(amount)} so'm</b> qo'shildi!\n` +
        `💳 <b>Hozirgi balansingiz:</b> ${formatSum(newBalance)} so'm`;
      await this.botManagerService.sendMessageToUser(user.telegramId, notifyText, user.botInstanceId || undefined);
    }

    return updated;
  }

  async toggleBanUser(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('Foydalanuvchi topilmadi');

    return this.prisma.user.update({
      where: { id: userId },
      data: { isBanned: !user.isBanned },
    });
  }

  /**
   * 30 daqiqalik tizim salomatligi va proxy holatini olish
   */
  async getSystemHealth() {
    let report = this.systemHealthService.getLastReport();
    if (!report) {
      report = await this.systemHealthService.runPeriodicHealthCheck();
    }
    const proxyStats = this.proxyManagerService.getStats();
    return { report, proxyStats };
  }

  /**
   * Salomatlikni qo'lda tekshirishni ishga tushirish
   */
  async triggerSystemHealthCheck() {
    const report = await this.systemHealthService.runPeriodicHealthCheck();
    const proxyStats = this.proxyManagerService.getStats();
    return { success: true, report, proxyStats };
  }

  /**
   * Barcha proxylar ro'yxati (bloklash holati bilan)
   */
  async listProxies() {
    return this.proxyManagerService.listProxiesForAdmin();
  }

  /**
   * Proxyni admin panelidan bloklash / blokdan chiqarish
   */
  async setProxyBlocked(id: number, isBlocked: boolean) {
    return this.proxyManagerService.setProxyBlocked(id, isBlocked);
  }

  /**
   * Kunlik ertalabki/kechki marketing xabarlarini qo'lda yoki zudlik bilan ishga tushirish
   */
  async triggerMarketingBroadcast(slot: 'MORNING' | 'EVENING' | 'TEST' = 'MORNING', targetBotId?: number) {
    return this.botMarketingService.executeBroadcast(slot, targetBotId);
  }

  /**
   * Bannerli va Inline tugmali maxsus Reklama yuborish
   */
  async triggerCustomAdBroadcast(params: {
    text: string;
    photoBase64OrUrl?: string;
    buttonText?: string;
    buttonUrl?: string;
    buttons?: Array<{ text: string; url: string }>;
    targetBotId?: number;
  }) {
    return this.botMarketingService.executeCustomAdBroadcast(params);
  }

  /**
   * Yuborilgan xabarlar tarixini olish
   */
  async getBroadcastHistory() {
    return this.botMarketingService.getBroadcastHistory();
  }

  /**
   * Mahalla ID yoki Havola orqali avtomatik ma'lumotlarni tortib olish (Proxy orqali)
   */
  async lookupMahalla(query: string) {
    return this.openBudgetService.lookupMahallaOrInitiative(query);
  }

  /**
   * 🔍 Foydalanuvchining shaxsiy JWT tokeni orqali OpenBudget profilini va qaysi loyihaga ovoz berganini rasmiy tekshirish
   */
  async checkVoteByToken(tokenOrPhone: string) {
    const input = (tokenOrPhone || '').trim();
    if (!input) {
      return { success: false, error: 'Token yoki telefon raqami kiritilmadi' };
    }

    let token = input;
    let phone = '';

    // Agar telefon raqam kiritilgan bo'lsa, bazadan uning saqlangan JWT tokenini topish
    if (/^\+?\d{9,12}$/.test(input.replace(/[\s\-\(\)]/g, ''))) {
      const clean = input.replace(/[^0-9]/g, '');
      const cleanPhone = clean.length === 9 ? `998${clean}` : clean;
      phone = cleanPhone;

      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { phone: cleanPhone },
            { phone: clean.slice(-9) },
          ],
        },
      });

      if (user && user.openBudgetJwt) {
        token = user.openBudgetJwt;
      } else {
        const vote = await this.prisma.vote.findFirst({
          where: { phone: cleanPhone, jwtToken: { not: null } },
          orderBy: { id: 'desc' },
        });
        if (vote && vote.jwtToken) {
          token = vote.jwtToken;
        }
      }
    }

    if (!token || token.length < 20) {
      return {
        success: false,
        error: 'Ushbu foydalanuvchining OpenBudget JWT tokeni topilmadi yoki token kiritilmagan.',
      };
    }

    const cleanToken = token.replace(/^bearer\s+/i, '').trim();

    // 1. Shaxsiy profilni olish
    const profileRes = await this.openBudgetService.getUserProfile(cleanToken);

    // 2. Ovoz berilgan loyihalarni olish
    const initiativesRes = await this.openBudgetService.getUserVotedInitiatives(cleanToken);

    return {
      success: true,
      token: cleanToken,
      phone: phone || profileRes.data?.phone_number || profileRes.data?.phone,
      profile: profileRes.data || null,
      votedInitiatives: initiativesRes.initiatives || [],
      totalVotes: initiativesRes.initiatives?.length || 0,
      isVerifiedOnOpenBudget: !!(profileRes.data || initiativesRes.initiatives?.length),
    };
  }

  /**
   * 🔎 OpenBudget umumiy qidiruv tizimi (Google/Search kabi Mahalla nomi, hudud yoki tuman bo'yicha)
   */
  async searchOpenBudgetInitiatives(query: string, page = 1) {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      return { success: false, error: 'Qidiruv so\'zi kiritilmadi' };
    }

    // 1. Agar to'g'ridan-to'g'ri 12 xonali Mahalla ID yoki URL bo'lsa
    if (/^\d{12}$/.test(trimmed) || trimmed.startsWith('http')) {
      const lookup = await this.openBudgetService.lookupMahallaOrInitiative(trimmed);
      return {
        success: true,
        results: lookup.success ? [lookup] : [],
        total: lookup.success ? 1 : 0,
      };
    }

    // 2. Matnli qidiruv (Mahalla nomi, tuman, viloyat bo'yicha)
    try {
      const res = await this.proxyManagerService.requestWithRetry(async (client) => {
        return client.get(`https://new.openbudget.uz/api/v1/initiatives`, {
          params: {
            title: trimmed,
            page,
            limit: 20,
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          },
          timeout: 8000,
        });
      });

      const list = res?.data?.items || res?.data?.data || (Array.isArray(res?.data) ? res.data : []);
      const total = res?.data?.total || list.length;

      const formatted = list.map((item: any) => ({
        id: item.id,
        publicId: item.public_id || item.id,
        mahallaName: item.quarter_title ? `${item.quarter_title} MFY` : (item.title || 'Noma\'lum mahalla'),
        region: item.region_title,
        district: item.district_title,
        boardId: String(item.board_id || '55'),
        currentVotes: item.vote_count || 0,
        targetVotes: 5000,
        openBudgetUrl: `https://new.openbudget.uz/uz/initiative-budget/active-initiatives/${item.board_id || 55}/${item.id}`,
        stage: item.stage,
      }));

      return {
        success: true,
        query: trimmed,
        total,
        page,
        results: formatted,
      };
    } catch (err: any) {
      return { success: false, error: `Qidiruv xatoligi: ${err.message}` };
    }
  }

  /**
   * Barcha faol botlar ovozlarini OpenBudgetdan 15 minutlik sinxronlash
   */
  async syncBotVotes() {
    return this.openBudgetService.syncAllBotVotes();
  }

  /**
   * 🔄 Aynan bitta botni OpenBudget bilan zudlik bilan sinxronlash
   */
  async syncSingleBot(id: number) {
    const bot = await this.prisma.botInstance.findUnique({ where: { id } });
    if (!bot) throw new Error('Bot topilmadi');

    let uuid = bot.initiativeUuid;
    if (!uuid && bot.mahallaId) {
      const lRes = await this.openBudgetService.lookupMahallaOrInitiative(bot.mahallaId);
      if (lRes.success && lRes.initiativeUuid) {
        uuid = lRes.initiativeUuid;
        await this.prisma.botInstance.update({
          where: { id: bot.id },
          data: { initiativeUuid: uuid, boardId: lRes.boardId },
        });
      }
    }

    let officialVotes = bot.currentVotes || 0;
    let grantedAmount = bot.grantedAmount ? Number(bot.grantedAmount) : 0;

    if (uuid) {
      // 1. Jonli rasmiy ovozlar sonini olish (v2 count)
      try {
        const countRes = await this.proxyManagerService.requestWithRetry(async (client) => {
          return client.get(`https://new.openbudget.uz/api/v2/info/initiative/count/${uuid}`, {
            timeout: 9000,
          });
        });
        if (countRes?.data && countRes.data.count !== undefined) {
          officialVotes = Number(countRes.data.count) || 0;
        }
      } catch (cErr) {}

      // 2. Loyiha ma'lumotlarini olish (v1 initiative)
      try {
        const res = await this.proxyManagerService.requestWithRetry(async (client) => {
          return client.get(`https://new.openbudget.uz/api/v1/initiatives/${uuid}`, {
            timeout: 9000,
          });
        });
        if (res?.data?.granted_amount) {
          grantedAmount = Number(res.data.granted_amount);
        }
      } catch (iErr) {}

      await this.prisma.botInstance.update({
        where: { id: bot.id },
        data: {
          currentVotes: officialVotes,
          ...(grantedAmount ? { grantedAmount: BigInt(grantedAmount) } : {}),
        },
      });
    }

    const verifiedVotes = await this.prisma.vote.count({
      where: { botInstanceId: bot.id, status: 'VERIFIED' },
    });
    const pendingVotes = await this.prisma.vote.count({
      where: { botInstanceId: bot.id, status: 'PENDING_VERIFICATION' },
    });

    return {
      success: true,
      botId: bot.id,
      mahallaName: bot.mahallaName,
      openBudgetVotes: officialVotes,
      currentVotes: verifiedVotes,
      pendingVotes,
      targetVotes: bot.targetVotes,
      grantedAmount: bot.grantedAmount ? Number(bot.grantedAmount) : 0,
      percentage: Math.min(100, Math.round(((verifiedVotes + pendingVotes) / (bot.targetVotes || 5000)) * 100)),
    };
  }

  /**
   * 🧩 Jonli OpenBudget Captcha Challenge olish va OCR bilan yechish
   */
  async getBotCaptchaChallenge() {
    try {
      const res = await this.proxyManagerService.requestWithRetry(async (client) => {
        return client.get('https://new.openbudget.uz/api/v2/vote/captcha-2', { timeout: 8000 });
      });

      if (!res?.data?.image) {
        return { success: false, error: 'Captcha yuklab bo\'lmadi' };
      }

      const captchaKey = res.data.captchaKey || '';
      const imageBase64 = res.data.image;
      const rawBuffer = Buffer.from(imageBase64, 'base64');

      let autoAnswer = '';
      try {
        const cleanPng = await sharp(rawBuffer, { failOn: 'none' }).png().toBuffer();
        const worker = await this.captchaSolverService.acquireWorker();
        if (worker) {
          try {
            const ocrRes = await worker.recognize(cleanPng);
            if (ocrRes?.data?.text) {
              autoAnswer = ocrRes.data.text.trim().replace(/[^a-zA-Z0-9]/g, '');
            }
          } finally {
            this.captchaSolverService.releaseWorker(worker);
          }
        }
      } catch (ocrErr: any) {
        this.logger.warn(`Captcha auto OCR error: ${ocrErr.message}`);
      }

      return {
        success: true,
        captchaKey,
        image: imageBase64,
        autoAnswer,
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 📋 Botga oid ovozlar ro'yxati va faollik tasmasi (Ovozlarni ko'rish)
   */
  async getBotVotesFeed(botId: number, page: number = 1, size: number = 15) {
    const bot = await this.prisma.botInstance.findUnique({ where: { id: botId } });
    if (!bot) throw new Error('Bot topilmadi');

    const total = await this.prisma.vote.count({ where: { botInstanceId: botId } });
    const votes = await this.prisma.vote.findMany({
      where: { botInstanceId: botId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    });

    const formatted = votes.map((v) => {
      const p = v.phone.replace(/[^0-9]/g, '');
      const maskedPhone = p.length >= 9
        ? `**-*${p.slice(-6, -4)}-${p.slice(-4, -2)}-${p.slice(-2)}`
        : `**-***-${p.slice(-4)}`;
      // Toshkent vaqti (UTC+5) — bazada UTC saqlanadi, ko'rsatishda +5 soat qo'shiladi
      const tashkentDate = new Date(new Date(v.createdAt).getTime() + 5 * 60 * 60 * 1000);
      const voteDate = tashkentDate.toISOString().replace('T', ' ').slice(0, 16);

      return {
        id: v.id,
        phoneNumber: maskedPhone,
        rawPhone: v.phone,
        voteDate,
        status: v.status,
        rewardAmount: v.rewardAmount,
        user: v.user ? { firstName: v.user.firstName, username: v.user.username } : null,
      };
    });

    return {
      success: true,
      botId,
      mahallaName: bot.mahallaName,
      openBudgetVotes: bot.currentVotes || 0,
      total,
      page,
      size,
      totalPages: Math.ceil(total / size) || 1,
      content: formatted,
    };
  }

  /**
   * 🔎 OpenBudget rasmiy ro'yxatining BARCHA sahifalari bo'ylab telefon raqami
   * bo'yicha qidirish (bitta sahifadagi ~15 tadan emas).
   */
  async searchBotOfficialVotes(botId: number, tail: string) {
    const bot = await this.prisma.botInstance.findUnique({ where: { id: botId } });
    if (!bot) throw new Error('Bot topilmadi');

    let uuid = bot.initiativeUuid;
    if (!uuid && bot.mahallaId) {
      const lRes = await this.openBudgetService.lookupMahallaOrInitiative(bot.mahallaId);
      if (lRes.success && lRes.initiativeUuid) uuid = lRes.initiativeUuid;
    }

    return this.openBudgetService.searchOfficialVotesByTail(uuid, tail.replace(/\D/g, ''));
  }

  /**
   * 🌐 OpenBudget Rasmiy Saytidan Ovozlar Ro'yxatini Olish (Official Votes List)
   */
  async getBotOfficialVotesList(botId: number, page: number = 0) {
    const bot = await this.prisma.botInstance.findUnique({ where: { id: botId } });
    if (!bot) throw new Error('Bot topilmadi');

    let uuid = bot.initiativeUuid;
    if (!uuid && bot.mahallaId) {
      const lRes = await this.openBudgetService.lookupMahallaOrInitiative(bot.mahallaId);
      if (lRes.success && lRes.initiativeUuid) {
        uuid = lRes.initiativeUuid;
      }
    }

    const res = await this.openBudgetService.fetchOfficialInitiativeVotesList(uuid, page);
    if (!res.success && res.error === 'OpenBudget token olinmadi') {
      const cap = await this.openBudgetService.getOfficialInitiativeCaptcha(uuid);

      // 📢 10 ta urinishdan keyin ham o'tmasa, barcha mas'ul Administratorlarga Telegram orqali xabar berish
      if (cap.captchaKey && cap.image) {
        await this.botManagerService.notifyAdminsOfficialCaptcha(
          botId,
          bot.mahallaName,
          uuid,
          cap.captchaKey,
          cap.image,
        ).catch(() => {});
      }

      return {
        success: false,
        needCaptcha: true,
        captchaKey: cap.captchaKey,
        image: cap.image,
        botId,
        mahallaName: bot.mahallaName,
        content: [],
        totalElements: bot.currentVotes || 0,
        totalPages: 0,
        page,
      };
    }

    return {
      ...res,
      botId,
      mahallaName: bot.mahallaName,
      prewarmStatus: uuid ? this.openBudgetService.getPrewarmStatus(uuid) : null,
    };
  }

  async getBotOfficialCaptcha(botId: number) {
    const cap = await this.openBudgetService.getOfficialInitiativeCaptcha();
    return { ...cap, botId };
  }

  async submitBotOfficialCaptcha(botId: number, captchaKey: string, captchaResult: number) {
    const bot = await this.prisma.botInstance.findUnique({ where: { id: botId } });
    if (!bot || !bot.initiativeUuid) throw new Error('Bot yoki tashabbus UUID topilmadi');

    const res = await this.openBudgetService.submitOfficialInitiativeCaptcha(
      bot.initiativeUuid,
      captchaKey,
      captchaResult,
    );

    if (res.success) {
      // First page of votes
      const votes = await this.openBudgetService.fetchOfficialInitiativeVotesList(bot.initiativeUuid, 0);
      return { success: true, ...votes };
    }

    return res;
  }
}
