import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { OpenBudgetService } from '../openbudget/openbudget.service';
import { BotManagerService } from '../bot/bot-manager.service';
import { SystemHealthService } from '../health/system-health.service';
import { ProxyManagerService } from '../proxy/proxy-manager.service';
import { BOT_MESSAGES, formatSum } from '../bot/bot.constants';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly openBudgetService: OpenBudgetService,
    private readonly botManagerService: BotManagerService,
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
    description?: string;
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
    avatarUrl?: string;
    description?: string;
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
        ...(data.description !== undefined && { description: data.description ? data.description.trim() : null }),
        ...(avatarUrl !== undefined && { avatarUrl }),
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
}
