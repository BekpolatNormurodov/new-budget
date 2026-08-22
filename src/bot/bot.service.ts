import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';
import { OpenBudgetService } from '../openbudget/openbudget.service';
import { WalletService } from '../wallet/wallet.service';
import { BOT_MESSAGES, BOT_BUTTONS } from './bot.constants';
import { BotKeyboards } from './bot.keyboards';

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private bot: Telegraf;
  private botInfo: any;
  private autoApproveInterval: any = null;
  private pendingCaptchaResolvers = new Map<number, { resolve: (v: number | null) => void; timeout: any }>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly openBudgetService: OpenBudgetService,
    private readonly walletService: WalletService,
  ) {}

  async onModuleInit() {
    const token = this.configService.get<string>('bot.token');
    if (!token) {
      this.logger.error('BOT_TOKEN topilmadi!');
      return;
    }

    this.bot = new Telegraf(token);

    this.setupHandlers();
    this.startVoteAutoApprover();

    try {
      this.botInfo = await this.bot.telegram.getMe();
      this.logger.log(`🤖 Bot ishga tushdi: @${this.botInfo.username}`);
      this.bot.launch().catch((err) => {
        this.logger.error('Bot launch error:', err);
      });
    } catch (err) {
      this.logger.error('Telegram botga ulanishda xatolik:', err);
    }
  }

  async onModuleDestroy() {
    if (this.autoApproveInterval) {
      clearInterval(this.autoApproveInterval);
    }
    if (this.bot) {
      this.bot.stop('SIGTERM');
    }
  }

  /**
   * Ovozlar holatini tekshiruvchi va avtomatik tasdiqlovchi fon vazifasi (2-24 soat oralig'ida)
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
          include: { user: true },
        });

        for (const vote of pendingVotes) {
          try {
            const res = await this.walletService.verifyVoteAndCredit(vote.id);
            if (!res.alreadyVerified) {
              await this.bot.telegram.sendMessage(
                vote.user.telegramId,
                BOT_MESSAGES.VOTE_VERIFIED_ALERT(vote.phone, res.rewardAmount, res.user.balance)
              ).catch(() => {});
            }
          } catch (e) {
            this.logger.error(`Ovoz #${vote.id} ni avtomatik tasdiqlashda xatolik:`, e);
          }
        }
      } catch (err) {
        this.logger.error('Auto approver cron error:', err);
      }
    }, 60000); // Har 1 daqiqada tekshiradi
  }

  /**
   * Foydalanuvchini bazadan topish yoki yangi yaratish (Referral tizimi: +5 000 so'm)
   */
  async getOrCreateUser(ctx: Context) {
    const from = ctx.from;
    if (!from) return null;

    const telegramId = from.id.toString();
    let user = await this.prisma.user.findUnique({
      where: { telegramId },
      include: { referrer: true, referrals: true },
    });

    if (!user) {
      const refCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const adminIds = this.configService.get<string[]>('bot.adminIds') || [];
      const isAdmin = adminIds.includes(telegramId);

      // Deep link orqali referral tekshirish
      let referredById: number | undefined = undefined;
      const startPayload = (ctx as any).startPayload || '';

      if (startPayload && startPayload.startsWith('ref_')) {
        const targetRefCode = startPayload.replace('ref_', '').trim();
        const referrer = await this.prisma.user.findUnique({
          where: { referralCode: targetRefCode },
        });
        if (referrer && referrer.telegramId !== telegramId) {
          referredById = referrer.id;
        }
      }

      user = await this.prisma.user.create({
        data: {
          telegramId,
          username: from.username,
          firstName: from.first_name,
          lastName: from.last_name,
          referralCode: refCode,
          role: isAdmin ? 'ADMIN' : 'USER',
          referredById,
        },
        include: { referrer: true, referrals: true },
      });

      this.logger.log(`🆕 Yangi foydalanuvchi: ${user.firstName} (@${user.username || 'yoq'}) | Ref: ${referredById || 'none'}`);

      // Agar referral orqali qo'shilgan bo'lsa, taklifchiga darhol +5 000 so'm berish!
      if (referredById) {
        const refBonusRes = await this.walletService.creditReferralJoinBonus(referredById, user.id);
        if (refBonusRes) {
          const referrer = await this.prisma.user.findUnique({ where: { id: referredById } });
          if (referrer) {
            try {
              await this.bot.telegram.sendMessage(
                referrer.telegramId,
                `🎉 Sizning referal havolangiz orqali yangi do'stingiz (${user.firstName || 'Foydalanuvchi'}) qo'shildi!\n💰 Hisobingizga +${refBonusRes.refBonus.toLocaleString('uz-UZ')} so'm bonus qo'shildi!\n💳 Hozirgi balansingiz: ${refBonusRes.updatedReferrer.balance.toLocaleString('uz-UZ')} so'm`
              );
            } catch (e) {}
          }
        }
      }
    } else {
      if (user.username !== from.username || user.firstName !== from.first_name) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { username: from.username, firstName: from.first_name, lastName: from.last_name },
          include: { referrer: true, referrals: true },
        });
      }
    }

    return user;
  }

  /**
   * Homiy kanallarga a'zolikni tekshirish
   */
  async checkChannelsSubscription(userId: string): Promise<boolean> {
    const channels = await this.prisma.sponsorChannel.findMany({ where: { isActive: true } });
    if (channels.length === 0) return true;

    for (const channel of channels) {
      try {
        const member = await this.bot.telegram.getChatMember(channel.channelId, Number(userId));
        if (['left', 'kicked'].includes(member.status)) {
          return false;
        }
      } catch (err) {
        this.logger.warn(`Kanal tekshirishda xatolik (${channel.channelId}): ${err.message}`);
      }
    }
    return true;
  }

  /**
   * Barcha bot eventlarini sozlash
   */
  private setupHandlers() {
    // 1. /start komandasi
    this.bot.start(async (ctx) => {
      try {
        const user = await this.getOrCreateUser(ctx);
        if (!user) return;

        if (user.isBanned) {
          return ctx.reply('⛔️ Siz botdan foydalanishdan chetlashtirilgansiz.');
        }

        await this.prisma.user.update({
          where: { id: user.id },
          data: { step: null, tempData: null },
        });

        const isSubscribed = await this.checkChannelsSubscription(user.telegramId);
        if (!isSubscribed) {
          const channels = await this.prisma.sponsorChannel.findMany({ where: { isActive: true } });
          return ctx.reply(
            BOT_MESSAGES.MUST_SUBSCRIBE,
            BotKeyboards.sponsorChannelsInline(channels)
          );
        }

        const voteReward = this.configService.get<number>('bot.voteReward') || 30000;
        const refBonus = this.configService.get<number>('bot.referralBonus') || 5000;

        await ctx.reply(
          BOT_MESSAGES.START(voteReward, refBonus),
          BotKeyboards.mainMenu(user.role === 'ADMIN')
        );
      } catch (err) {
        this.logger.error('/start xatoligi:', err);
      }
    });

    // 2. 🗳 Ovoz berish tugmasi
    this.bot.hears(BOT_BUTTONS.VOTE, async (ctx) => {
      try {
        const user = await this.getOrCreateUser(ctx);
        if (!user || user.isBanned) return;

        await this.prisma.user.update({
          where: { id: user.id },
          data: { step: 'AWAITING_PHONE', tempData: null },
        });

        await ctx.reply(
          BOT_MESSAGES.VOTE_PROMPT,
          BotKeyboards.phoneRequestKeyboard()
        );
      } catch (err) {
        this.logger.error('Ovoz berish tugmasi xatoligi:', err);
      }
    });

    // 3. 💰 Balans tugmasi
    this.bot.hears(BOT_BUTTONS.BALANCE, async (ctx) => {
      try {
        const user = await this.getOrCreateUser(ctx);
        if (!user) return;

        const referralsCount = await this.prisma.user.count({ where: { referredById: user.id } });
        const votesCount = await this.prisma.vote.count({ where: { userId: user.id, status: 'VERIFIED' } });
        const pendingVotesCount = await this.prisma.vote.count({ where: { userId: user.id, status: 'PENDING_VERIFICATION' } });
        const voteReward = this.configService.get<number>('bot.voteReward') || 30000;

        await ctx.reply(
          BOT_MESSAGES.BALANCE(user.balance, referralsCount, votesCount, pendingVotesCount, user.totalWithdrawn, voteReward),
          BotKeyboards.balanceInline()
        );
      } catch (err) {
        this.logger.error('Balans tugmasi xatoligi:', err);
      }
    });

    // 4. 📩 Pulni yechib olish tugmasi
    this.bot.hears(BOT_BUTTONS.WITHDRAW, async (ctx) => {
      try {
        const user = await this.getOrCreateUser(ctx);
        if (!user) return;

        const minWithdrawal = this.configService.get<number>('bot.minWithdrawal') || 10000;

        await ctx.reply(
          BOT_MESSAGES.WITHDRAW_CHOOSE_METHOD(user.balance, minWithdrawal),
          BotKeyboards.withdrawMethodsInline()
        );
      } catch (err) {
        this.logger.error('Pul yechish tugmasi xatoligi:', err);
      }
    });

    // 5. 🔗 Referal ssilka tugmasi
    this.bot.hears(BOT_BUTTONS.REFERRAL, async (ctx) => {
      try {
        const user = await this.getOrCreateUser(ctx);
        if (!user) return;

        const refCount = await this.prisma.user.count({ where: { referredById: user.id } });
        const refBonus = this.configService.get<number>('bot.referralBonus') || 5000;
        const botUsername = this.botInfo?.username || this.configService.get<string>('bot.username') || 'openbudjet_ishonch_2026_bot';
        const refLink = `https://t.me/${botUsername}?start=ref_${user.referralCode}`;

        await ctx.reply(
          BOT_MESSAGES.REFERRAL(refLink, refCount, refBonus),
          BotKeyboards.referralInline(botUsername, user.referralCode)
        );
      } catch (err) {
        this.logger.error('Referal tugmasi xatoligi:', err);
      }
    });

    // 6. ❌ Bekor qilish tugmasi
    this.bot.hears(BOT_BUTTONS.CANCEL, async (ctx) => {
      try {
        const user = await this.getOrCreateUser(ctx);
        if (!user) return;

        await this.prisma.user.update({
          where: { id: user.id },
          data: { step: null, tempData: null },
        });

        await ctx.reply('Amal bekor qilindi.', BotKeyboards.mainMenu(user.role === 'ADMIN'));
      } catch (err) {
        this.logger.error('Bekor qilish xatoligi:', err);
      }
    });

    // 7. 👑 Admin panel buyrug'i
    this.bot.hears(BOT_BUTTONS.ADMIN_PANEL, async (ctx) => {
      try {
        const user = await this.getOrCreateUser(ctx);
        if (!user || user.role !== 'ADMIN') return;

        await ctx.reply('👑 Admin boshqaruv paneli:', BotKeyboards.adminMenuInline());
      } catch (err) {
        this.logger.error('Admin panel ochishda xatolik:', err);
      }
    });

    this.bot.command('admin', async (ctx) => {
      const user = await this.getOrCreateUser(ctx);
      if (!user || user.role !== 'ADMIN') return;
      await ctx.reply('👑 Admin boshqaruv paneli:', BotKeyboards.adminMenuInline());
    });

    // 8. Kontakt qabul qilish
    this.bot.on('contact', async (ctx) => {
      try {
        const user = await this.getOrCreateUser(ctx);
        if (!user || user.isBanned) return;

        const contact = ctx.message.contact;
        if (contact && contact.phone_number) {
          await this.handlePhoneNumberInput(ctx, user, contact.phone_number);
        }
      } catch (err) {
        this.logger.error('Kontakt qabul qilish xatoligi:', err);
      }
    });

    // 9. Callback querylar (Inline tugmalar)
    this.bot.on('callback_query', async (ctx) => {
      try {
        const data = (ctx.callbackQuery as any).data;
        const user = await this.getOrCreateUser(ctx);
        if (!user) return;

        await ctx.answerCbQuery().catch(() => {});

        // Pul yechish to'lov usuli tanlanganda
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
            data: {
              step: 'WITHDRAW_AMOUNT',
              tempData: JSON.stringify({ method }),
            },
          });

          await ctx.reply(
            BOT_MESSAGES.WITHDRAW_ENTER_AMOUNT(method === 'PAYNET' ? 'Paynet' : 'Uzcard/Humo', user.balance, minWithdrawal),
            BotKeyboards.cancelKeyboard()
          );
        }

        // Qayta yangilash
        else if (data === 'refresh_balance') {
          const updatedUser = await this.prisma.user.findUnique({ where: { id: user.id } });
          const referralsCount = await this.prisma.user.count({ where: { referredById: user.id } });
          const votesCount = await this.prisma.vote.count({ where: { userId: user.id, status: 'VERIFIED' } });
          const pendingVotesCount = await this.prisma.vote.count({ where: { userId: user.id, status: 'PENDING_VERIFICATION' } });
          const voteReward = this.configService.get<number>('bot.voteReward') || 30000;

          try {
            await ctx.editMessageText(
              BOT_MESSAGES.BALANCE(updatedUser.balance, referralsCount, votesCount, pendingVotesCount, updatedUser.totalWithdrawn, voteReward),
              {
                reply_markup: BotKeyboards.balanceInline().reply_markup,
              }
            );
          } catch (e) {}
        }

        // Bekor qilish callback
        else if (data === 'cancel_action') {
          await this.prisma.user.update({
            where: { id: user.id },
            data: { step: null, tempData: null },
          });
          await ctx.reply('Amal bekor qilindi.');
        }

        // Homiy kanal tekshirish
        else if (data === 'check_subscription') {
          const isSub = await this.checkChannelsSubscription(user.telegramId);
          if (isSub) {
            await ctx.reply('✅ Barcha kanallarga a\'zolik tasdiqlandi!');
            const voteReward = this.configService.get<number>('bot.voteReward') || 30000;
            const refBonus = this.configService.get<number>('bot.referralBonus') || 5000;
            await ctx.reply(BOT_MESSAGES.START(voteReward, refBonus), BotKeyboards.mainMenu(user.role === 'ADMIN'));
          } else {
            await ctx.reply('❌ Hali barcha kanallarga a\'zo bo\'lmadingiz. Iltimos barchasiga a\'zo bo\'ling.');
          }
        }

        // Admin: Pul yechishni tasdiqlash
        else if (data.startsWith('adm_app_') && user.role === 'ADMIN') {
          const wId = parseInt(data.replace('adm_app_', ''), 10);
          const withdrawal = await this.walletService.approveWithdrawal(wId);
          await ctx.editMessageText(
            `✅ Pul yechish #${wId} TASDIQLANDI!\nFoydalanuvchi: ${withdrawal.user.firstName} (+${withdrawal.user.phone || ''})\nSumma: ${withdrawal.amount.toLocaleString('uz-UZ')} so'm\nHisob: ${withdrawal.accountDetails}`
          );
          try {
            await this.bot.telegram.sendMessage(
              withdrawal.user.telegramId,
              `✅ Sizning ${withdrawal.amount.toLocaleString('uz-UZ')} so'mlik pul yechish so'rovingiz tasdiqlandi va ${withdrawal.accountDetails} hisobingizga to'lab berildi! 🎉`
            );
          } catch (e) {}
        }

        // Admin: Pul yechishni rad etish
        else if (data.startsWith('adm_rej_') && user.role === 'ADMIN') {
          const wId = parseInt(data.replace('adm_rej_', ''), 10);
          const { updated, user: wUser } = await this.walletService.rejectWithdrawal(wId);
          await ctx.editMessageText(
            `❌ Pul yechish #${wId} RAD ETILDI va mablag' balansga qaytarildi!\nFoydalanuvchi: ${wUser.firstName}\nSumma: ${updated.amount.toLocaleString('uz-UZ')} so'm`
          );
          try {
            await this.bot.telegram.sendMessage(
              wUser.telegramId,
              `❌ Sizning ${updated.amount.toLocaleString('uz-UZ')} so'mlik pul yechish so'rovingiz rad etildi va mablag' balansingizga qaytarildi.`
            );
          } catch (e) {}
        }

        // Admin: Statistika ko'rish
        else if (data === 'admin_stats' && user.role === 'ADMIN') {
          const totalUsers = await this.prisma.user.count();
          const totalVotes = await this.prisma.vote.count({ where: { status: 'VERIFIED' } });
          const pendingVotes = await this.prisma.vote.count({ where: { status: 'PENDING_VERIFICATION' } });
          const totalWithdrawals = await this.prisma.withdrawal.aggregate({
            where: { status: 'APPROVED' },
            _sum: { amount: true },
          });
          const pendingWithdrawals = await this.prisma.withdrawal.count({ where: { status: 'PENDING' } });

          await ctx.reply(
            `📊 BOT STATISTIKASI:\n\n👥 Jami foydalanuvchilar: ${totalUsers} ta\n🗳 Tasdiqlangan ovozlar: ${totalVotes} ta\n⏳ Tekshirilayotgan ovozlar: ${pendingVotes} ta\n💸 Jami to'langan summa: ${(totalWithdrawals._sum.amount || 0).toLocaleString('uz-UZ')} so'm\n💳 Kutilayotgan pul yechish: ${pendingWithdrawals} ta`
          );
        }

        // Admin: Tashabbuslar va Mahallalar ro'yxati
        else if (data === 'admin_initiatives' && user.role === 'ADMIN') {
          const initiatives = await this.openBudgetService.getAllInitiatives();
          let text = `🗳 OCHIQ BUDJET TASHABBUSLARI (MAHALLALAR):\n\n`;

          const buttons: any[] = [];
          initiatives.forEach((init, idx) => {
            const isDef = init.isDefault ? '✅ [FAOL]' : '⚪️';
            text += `${idx + 1}. ${isDef} <b>${init.mahallaName || init.title}</b>\n`;
            text += `   📍 Mahalla ID: <code>${init.mahallaId || init.openBudgetId}</code>\n`;
            text += `   🔗 Havola: ${init.url || 'Kiritilmagan'}\n`;
            text += `   🎯 Maqsad: ${init.currentVotes} / ${init.targetVotes} ovoz\n\n`;

            buttons.push([
              init.isDefault
                ? { text: `✅ ${init.mahallaName || init.mahallaId || 'Faol'} (Tanlangan)`, callback_data: 'noop' }
                : { text: `🔘 Tanlash: ${init.mahallaName || init.mahallaId}`, callback_data: `adm_act_init_${init.id}` },
            ]);
          });

          buttons.push([{ text: '➕ Yangi Havola / Mahalla qo\'shish', callback_data: 'adm_add_init' }]);
          buttons.push([{ text: '🔙 Admin menyu', callback_data: 'back_to_admin' }]);

          await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons },
          });
        }

        // Admin: Faol mahallani tanlash
        else if (data.startsWith('adm_act_init_') && user.role === 'ADMIN') {
          const initId = parseInt(data.replace('adm_act_init_', ''), 10);
          const active = await this.openBudgetService.switchDefaultInitiative(initId);
          await ctx.reply(
            `✅ Faol mahalla o'zgartirildi!\n\n📍 Mahalla: <b>${active.mahallaName || active.title}</b>\n🆔 Mahalla ID: <code>${active.mahallaId || active.openBudgetId}</code>\n🔗 Havola: ${active.url}\n\nEndi bot orqali beriladigan barcha yangi ovozlar ushbu mahallaga yo'naltiriladi! 🚀`,
            { parse_mode: 'HTML' }
          );
        }

        // Admin: Yangi mahalla qo'shish so'rovi
        else if (data === 'adm_add_init' && user.role === 'ADMIN') {
          await this.prisma.user.update({
            where: { id: user.id },
            data: { step: 'AWAITING_INITIATIVE_INPUT', tempData: null },
          });
          await ctx.reply(
            `🔗 Yangi Open Budget havolasini yoki 12 xonali Mahalla ID raqamini yuboring:\n\nMasalan:\n<code>https://openbudget.uz/boards/initiatives/initiative/53/7710ad19-6734-4df9-ab25-a5d2de6facbf</code>\nyoki\n<code>055495798013</code>`,
            { parse_mode: 'HTML' }
          );
        }

        // Admin: Asosiy admin menyusiga qaytish
        else if (data === 'back_to_admin' && user.role === 'ADMIN') {
          await ctx.reply('👑 Admin boshqaruv paneli:', BotKeyboards.adminMenuInline());
        }
      } catch (err) {
        this.logger.error('Callback query xatoligi:', err);
      }
    });

    // 10. Matnli xabarlarni qayta ishlash (Wizard / Step handling)
    this.bot.on('text', async (ctx) => {
      try {
        const text = ctx.message.text.trim();

        // Foydalanuvchi kaptcha rasmiga javob kutilayotgan bo'lsa, avval shu javobni ushlaymiz
        const pendingCaptcha = this.pendingCaptchaResolvers.get(ctx.from.id);
        if (pendingCaptcha) {
          const match = text.replace(/\s/g, '').match(/-?\d+/);
          const num = match ? parseInt(match[0], 10) : NaN;
          clearTimeout(pendingCaptcha.timeout);
          this.pendingCaptchaResolvers.delete(ctx.from.id);
          pendingCaptcha.resolve(Number.isNaN(num) ? null : num);
          if (!Number.isNaN(num)) {
            await ctx.reply('✅ Rahmat! Javobingiz qabul qilindi, davom etilmoqda...');
          } else {
            await ctx.reply('⚠️ Raqam aniqlanmadi, avtomatik urinish davom etmoqda...');
          }
          return;
        }

        const user = await this.getOrCreateUser(ctx);
        if (!user || user.isBanned) return;

        if (Object.values(BOT_BUTTONS).includes(text)) {
          return;
        }

        // 1-QADAM: Telefon raqam kiritilishi kutilayotgan bo'lsa
        if (user.step === 'AWAITING_PHONE') {
          await this.handlePhoneNumberInput(ctx, user, text);
          return;
        }

        // 2-QADAM: SMS kod kiritilishi kutilayotgan bo'lsa
        if (user.step === 'AWAITING_SMS_CODE') {
          await this.handleSmsCodeInput(ctx, user, text);
          return;
        }

        // 3-QADAM: Pul yechish - Summa kiritish
        if (user.step === 'WITHDRAW_AMOUNT') {
          await this.handleWithdrawAmountInput(ctx, user, text);
          return;
        }

        // 4-QADAM: Pul yechish - Karta yoki telefon raqami kiritish
        if (user.step === 'WITHDRAW_ACCOUNT') {
          await this.handleWithdrawAccountInput(ctx, user, text);
          return;
        }

        // 5-QADAM: Admin - Yangi havola yoki Mahalla ID kiritish
        if (user.step === 'AWAITING_INITIATIVE_INPUT' && user.role === 'ADMIN') {
          await this.handleInitiativeInput(ctx, user, text);
          return;
        }

        // Standart holatda agar oddiy telefon raqam kiritilsa ham ovoz berish jarayonini boshlash
        if (/^(\+?998)?[0-9]{9}$/.test(text.replace(/[\s\-\(\)]/g, ''))) {
          await this.handlePhoneNumberInput(ctx, user, text);
          return;
        }
      } catch (err) {
        this.logger.error('Matnli xabarni ishlashda xatolik:', err);
      }
    });
  }

  /**
   * Admin tomonidan yangi mahalla havolasi yoki ID kiritilganda
   */
  private async handleInitiativeInput(ctx: Context, user: any, input: string) {
    try {
      let url: string | undefined = undefined;
      let mahallaId: string | undefined = undefined;

      if (input.startsWith('http://') || input.startsWith('https://')) {
        url = input;
        const parsed = this.openBudgetService.parseInitiativeUrl(url);
        mahallaId = parsed.initiativeUuid;
      } else if (/^\d{6,15}$/.test(input.trim())) {
        mahallaId = input.trim();
      } else {
        url = input;
      }

      const updated = await this.openBudgetService.setOrUpdateInitiative({
        url,
        mahallaId,
        setAsDefault: true,
      });

      await this.prisma.user.update({
        where: { id: user.id },
        data: { step: null, tempData: null },
      });

      await ctx.reply(
        `🎉 YANGI MAHALLA MUVAFFAQIYATLI O'RNATILDI!\n\n📍 Mahalla / Tashabbus: <b>${updated.mahallaName || updated.title}</b>\n🆔 Mahalla ID: <code>${updated.mahallaId || updated.openBudgetId}</code>\n🔗 Havola: ${updated.url || 'Mavjud emas'}\n\n✅ Barcha ovozlar endi ushbu mahallaga yig'iladi!`,
        { parse_mode: 'HTML' }
      );
    } catch (err: any) {
      await ctx.reply(`❌ Xatolik: ${err.message}`);
    }
  }

  /**
   * Avtomatik OCR kaptchani yecha olmaganda, foydalanuvchining o'ziga rasmni yuborib,
   * javobini kutadi (belgilangan vaqt ichida javob kelmasa, avtomatik urinish davom etadi).
   */
  private askUserToSolveCaptcha(ctx: Context, imageBuffer: Buffer): Promise<number | null> {
    const userId = ctx.from.id;
    return new Promise<number | null>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.pendingCaptchaResolvers.get(userId)) {
          this.pendingCaptchaResolvers.delete(userId);
          resolve(null);
        }
      }, 45000);

      this.pendingCaptchaResolvers.set(userId, { resolve, timeout });

      ctx
        .replyWithPhoto(
          { source: imageBuffer },
          { caption: '🧮 Robot kaptchani avtomatik o\'qiy olmadi.\n\nIltimos, rasmdagi misolni hisoblab, javobini (faqat son) yozib yuboring:' },
        )
        .catch((err) => {
          this.logger.warn(`Kaptcha rasmini yuborishda xato: ${err.message}`);
          clearTimeout(timeout);
          this.pendingCaptchaResolvers.delete(userId);
          resolve(null);
        });
    });
  }

  /**
   * Telefon raqam kiritilganda Open Budget SMS so'rash
   */
  private async handlePhoneNumberInput(ctx: Context, user: any, rawPhone: string) {
    const { clean9, clean12 } = this.openBudgetService.normalizePhone(rawPhone);

    if (clean9.length !== 9) {
      return ctx.reply('❌ Telefon raqami noto\'g\'ri formatda. Iltimos, 901234567 formatida yuboring:');
    }

    // Telefon raqam orqali oldin ovoz berilganligini tekshirish
    const existingVote = await this.prisma.vote.findFirst({
      where: {
        phone: clean12,
        status: { in: ['VERIFIED', 'PENDING_VERIFICATION'] },
      },
    });

    if (existingVote) {
      return ctx.reply(
        `⚠️ Ushbu telefon raqam (+${clean12}) orqali allaqachon ovoz berilgan!\n\n📌 Ochiq Budjet qoidalariga ko'ra har bir telefon raqamdan bir mavsumda faqat 1 marta ovoz berish mumkin.\n\nIltimos, boshqa telefon raqam kiriting (masalan: 901234567):`,
        BotKeyboards.phoneRequestKeyboard()
      );
    }

    const waitMsg = await ctx.reply(BOT_MESSAGES.WAITING);

    try {
      const initiative = await this.openBudgetService.getDefaultInitiative();
      const res = await this.openBudgetService.requestSmsForVote(
        clean12,
        initiative.id,
        (imageBuffer) => this.askUserToSolveCaptcha(ctx, imageBuffer),
      );

      if (!res.success) {
        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
        return ctx.reply(`❌ ${res.error || 'Ovoz berishda xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.'}`);
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          phone: clean12,
          step: 'AWAITING_SMS_CODE',
          tempData: JSON.stringify({
            phone: clean12,
            sessionId: res.sessionId,
            initiativeId: initiative.id,
          }),
        },
      });

      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await ctx.reply(BOT_MESSAGES.SMS_SENT(clean12), BotKeyboards.cancelKeyboard());
    } catch (err) {
      this.logger.error('SMS so\'rovida xatolik:', err);
      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await ctx.reply('❌ Tizimda xatolik yuz berdi. Iltimos keyinroq urinib ko\'ring.');
    }
  }

  /**
   * SMS kod kiritilganda tekshirish va ovozni PENDING_VERIFICATION (2-24 soat) ga o'tkazish
   */
  private async handleSmsCodeInput(ctx: Context, user: any, smsCode: string) {
    if (!user.tempData) {
      await this.prisma.user.update({ where: { id: user.id }, data: { step: null } });
      return ctx.reply('Sessiya muddati tugagan. Qaytadan ovoz berish tugmasini bosing.');
    }

    const tempData = JSON.parse(user.tempData);
    const { phone, sessionId, initiativeId } = tempData;

    const waitMsg = await ctx.reply(BOT_MESSAGES.WAITING);

    try {
      const verifyRes = await this.openBudgetService.verifySmsCode(phone, smsCode, sessionId);

      if (!verifyRes.success) {
        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
        return ctx.reply(`❌ ${verifyRes.error || 'SMS kod noto\'g\'ri kiritildi. Qaytadan kiriting:'}`);
      }

      const voteReward = this.configService.get<number>('bot.voteReward') || 30000;

      // Ovozni 'PENDING_VERIFICATION' holatida saqlaymiz
      await this.prisma.vote.create({
        data: {
          userId: user.id,
          initiativeId: initiativeId || null,
          phone,
          status: 'PENDING_VERIFICATION',
          rewardAmount: voteReward,
          smsCode,
          sessionId,
        },
      });

      // Foydalanuvchi qadamini tozalash
      await this.prisma.user.update({
        where: { id: user.id },
        data: { step: null, tempData: null },
      });

      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

      // 2-24 soatda tasdiqlanishi haqida status xabari yuborish
      await ctx.reply(
        BOT_MESSAGES.VOTE_SUBMITTED_PENDING(phone, voteReward),
        BotKeyboards.mainMenu(user.role === 'ADMIN')
      );
    } catch (err) {
      this.logger.error('SMS kod tekshirishda xatolik:', err);
      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await ctx.reply('❌ Kodni tekshirishda xatolik yuz berdi. Qaytadan urinib ko\'ring.');
    }
  }

  /**
   * Pul yechish: Summa kiritish
   */
  private async handleWithdrawAmountInput(ctx: Context, user: any, amountText: string) {
    const amount = parseInt(amountText.replace(/[^0-9]/g, ''), 10);
    const minWithdrawal = this.configService.get<number>('bot.minWithdrawal') || 10000;

    if (isNaN(amount) || amount < minWithdrawal) {
      return ctx.reply(`❌ Noto'g'ri summa! Minimal yechish summasi: ${minWithdrawal.toLocaleString('uz-UZ')} so'm.`);
    }

    if (amount > user.balance) {
      return ctx.reply(`❌ Balansingizda mablag' yetarli emas! Mavjud: ${user.balance.toLocaleString('uz-UZ')} so'm.`);
    }

    const tempData = user.tempData ? JSON.parse(user.tempData) : {};
    tempData.amount = amount;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        step: 'WITHDRAW_ACCOUNT',
        tempData: JSON.stringify(tempData),
      },
    });

    await ctx.reply(
      BOT_MESSAGES.WITHDRAW_ENTER_ACCOUNT(tempData.method),
      BotKeyboards.cancelKeyboard()
    );
  }

  /**
   * Pul yechish: Karta / Telefon kiritish va adminlarga xabar yuborish
   */
  private async handleWithdrawAccountInput(ctx: Context, user: any, accountText: string) {
    const cleanAccount = accountText.replace(/\s+/g, '');
    const tempData = user.tempData ? JSON.parse(user.tempData) : {};
    const { amount, method } = tempData;

    if (method === 'CARD' && cleanAccount.length < 16) {
      return ctx.reply('❌ Karta raqami kamida 16 ta raqam bo\'lishi kerak (masalan: 8600123456789012):');
    }

    try {
      const { updatedUser, withdrawal } = await this.walletService.createWithdrawalRequest({
        userId: user.id,
        amount: amount || 10000,
        paymentMethod: method === 'PAYNET' ? 'PAYNET' : 'UZCARD',
        accountDetails: cleanAccount,
      });

      await this.prisma.user.update({
        where: { id: user.id },
        data: { step: null, tempData: null },
      });

      await ctx.reply(
        BOT_MESSAGES.WITHDRAW_CONFIRMATION(withdrawal.amount, withdrawal.paymentMethod, withdrawal.accountDetails),
        BotKeyboards.mainMenu(user.role === 'ADMIN')
      );

      const adminIds = this.configService.get<string[]>('bot.adminIds') || [];
      const adminMsg = `💸 YANGI PUL YECHISH SO'ROVI #${withdrawal.id}!\n\n👤 Foydalanuvchi: ${user.firstName} (@${user.username || 'yoq'})\n💰 Summa: ${withdrawal.amount.toLocaleString('uz-UZ')} so'm\n💳 To'lov turi: ${withdrawal.paymentMethod}\n📝 Hisob: ${withdrawal.accountDetails}\n⏰ Vaqt: ${new Date().toLocaleString('uz-UZ')}`;

      for (const adminId of adminIds) {
        try {
          await this.bot.telegram.sendMessage(
            adminId,
            adminMsg,
            BotKeyboards.adminWithdrawalAction(withdrawal.id)
          );
        } catch (e) {}
      }
    } catch (err: any) {
      await ctx.reply(`❌ Xatolik: ${err.message}`);
    }
  }
}
