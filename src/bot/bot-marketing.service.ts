import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BotManagerService } from './bot-manager.service';
import { Markup } from 'telegraf';

export interface BroadcastResult {
  slot: 'MORNING' | 'EVENING' | 'TEST';
  totalBots: number;
  totalUsers: number;
  sentCount: number;
  failedCount: number;
  durationMs: number;
  details: Array<{
    botId: number;
    mahallaName: string;
    targetReached: boolean;
    sent: number;
    failed: number;
  }>;
}

@Injectable()
export class BotMarketingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotMarketingService.name);
  private scheduleIntervalHandle: NodeJS.Timeout | null = null;
  private lastExecutedKey = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly botManager: BotManagerService,
  ) {}

  onModuleInit() {
    this.startDailyScheduler();
    this.logger.log('📢 Avtomatik Kunlik 4-Vaqtli Marketing & Eslatma Tizimi faollashtirildi (10:00, 14:00, 18:30, 21:00).');
  }

  onModuleDestroy() {
    if (this.scheduleIntervalHandle) {
      clearInterval(this.scheduleIntervalHandle);
    }
  }

  /**
   * Kunlik 4 martalik aqlli rejalashtiruvchi (10:00, 14:00, 18:30, 21:00 - Toshkent vaqti)
   * Ovoz bermagan yoki start bosib chala qoldirgan userlarga chiroyli eslatmalar yuboradi
   */
  private startDailyScheduler() {
    this.scheduleIntervalHandle = setInterval(async () => {
      try {
        const now = new Date();
        // Toshkent vaqti (UTC+5)
        const tashkentHours = (now.getUTCHours() + 5) % 24;
        const tashkentMinutes = now.getUTCMinutes();
        const dateStr = now.toISOString().slice(0, 10);

        // 1. Ertalabki xabar (10:00 - 10:05)
        if (tashkentHours === 10 && tashkentMinutes <= 5) {
          const slotKey = `${dateStr}_MORNING`;
          if (this.lastExecutedKey !== slotKey) {
            this.lastExecutedKey = slotKey;
            this.logger.log('🌅 Ertalabki (10:00) eslatma yuborilmoqda...');
            await this.executeBroadcast('MORNING');
          }
        }

        // 2. Tushlik xabari (14:00 - 14:05)
        if (tashkentHours === 14 && tashkentMinutes <= 5) {
          const slotKey = `${dateStr}_AFTERNOON`;
          if (this.lastExecutedKey !== slotKey) {
            this.lastExecutedKey = slotKey;
            this.logger.log('☀️ Tushlik (14:00) eslatmasi yuborilmoqda...');
            await this.executeBroadcast('AFTERNOON' as any);
          }
        }

        // 3. Kechki xabar (18:30 - 18:35)
        if (tashkentHours === 18 && tashkentMinutes >= 30 && tashkentMinutes <= 35) {
          const slotKey = `${dateStr}_EVENING`;
          if (this.lastExecutedKey !== slotKey) {
            this.lastExecutedKey = slotKey;
            this.logger.log('🌆 Kechki (18:30) eslatmasi yuborilmoqda...');
            await this.executeBroadcast('EVENING');
          }
        }

        // 4. Tungi yakuniy xabar (21:00 - 21:05)
        if (tashkentHours === 21 && tashkentMinutes <= 5) {
          const slotKey = `${dateStr}_NIGHT`;
          if (this.lastExecutedKey !== slotKey) {
            this.lastExecutedKey = slotKey;
            this.logger.log('🌙 Tungi (21:00) eslatmasi yuborilmoqda...');
            await this.executeBroadcast('NIGHT' as any);
          }
        }
      } catch (err: any) {
        this.logger.error(`Scheduler xatoligi: ${err.message}`);
      }
    }, 60000);
  }

  /**
   * Xabarlarni yuborishni bajarish
   */
  public async executeBroadcast(
    slot: 'MORNING' | 'EVENING' | 'TEST' = 'MORNING',
    targetBotId?: number,
  ): Promise<BroadcastResult> {
    const startTime = Date.now();

    // 1. Agar xotirada botlar ishga tushmagan bo'lsa, barchasini ishga tushiramiz
    if (this.botManager.getAllActiveBots().length === 0) {
      await this.botManager.launchAllActiveBots();
    }

    const allBotsRecords = await this.prisma.botInstance.findMany({
      where: {
        ...(targetBotId ? { id: targetBotId } : {}),
      },
    });

    // 2. Bazadagi barcha haqiqiy foydalanuvchilarni olish
    const rawUsers = await this.prisma.user.findMany({
      orderBy: { id: 'asc' },
    });

    const allUsers = rawUsers.filter(
      (u) => !u.isBanned && u.telegramId && u.telegramId !== '0' && u.telegramId.trim() !== ''
    );

    this.logger.log(`📢 [Marketing Broadcast]: Jami ${allBotsRecords.length} ta bot va ${allUsers.length} ta foydalanuvchi aniqlandi.`);

    // 3. Botlar statistikasini hisoblash
    const botStatsList = await Promise.all(
      allBotsRecords.map(async (b) => {
        const verifiedVotes = await this.prisma.vote.count({
          where: { botInstanceId: b.id, status: 'VERIFIED' },
        });
        const target = b.targetVotes || 5000;
        const remaining = Math.max(0, target - verifiedVotes);
        const isTargetReached = verifiedVotes >= target;
        return {
          ...b,
          verifiedVotes,
          target,
          remaining,
          isTargetReached,
        };
      })
    );

    // Hozirda faol va rejasi to'lmagan boshqa botlar (Cross-Promo uchun)
    const activeUnfinishedBots = botStatsList.filter((b) => b.isActive && b.status === 'ONLINE' && !b.isTargetReached);

    let totalSent = 0;
    let totalFailed = 0;
    const details: BroadcastResult['details'] = [];

    // 4. HAMMA BOTLAR (SHU JUMLADAN TO'XTATILGAN/ARXIVLANGAN) BO'YICHA BIRMA-BIR XABAR YUBORISH
    for (const botStat of botStatsList) {
      let liveBot = this.botManager.getActiveBot(botStat.id);
      if (!liveBot) {
        await this.botManager.startBotInstance(botStat);
        liveBot = this.botManager.getActiveBot(botStat.id);
      }

      if (!liveBot) {
        this.logger.warn(`⚠️ [Bot #${botStat.id}] ${botStat.mahallaName} botini ishga tushirib bo'lmadi.`);
        continue;
      }

      // Bu botga tegishli foydalanuvchilar (agar biriktirilmagan bo'lsa, barchasiga yuboradi)
      let botUsers = allUsers.filter((u) => u.botInstanceId === botStat.id);
      if (botUsers.length === 0) {
        botUsers = allUsers;
      }

      let botSent = 0;
      let botFailed = 0;

      const otherActiveBots = activeUnfinishedBots.filter((b) => b.id !== botStat.id);
      const { text, keyboard } = this.buildMarketingMessage(botStat, otherActiveBots, slot);

      for (const user of botUsers) {
        try {
          await liveBot.bot.telegram.sendMessage(user.telegramId, text, {
            parse_mode: 'HTML',
            ...keyboard,
          });
          botSent++;
          totalSent++;
        } catch (err: any) {
          botFailed++;
          totalFailed++;
          if (err.description?.includes('blocked') || err.description?.includes('deactivated')) {
            await this.prisma.user.update({
              where: { id: user.id },
              data: { isBanned: true },
            }).catch(() => {});
          }
        }

        // Telegram Flood Limit: 35ms oralig'i
        await new Promise((r) => setTimeout(r, 35));
      }

      details.push({
        botId: botStat.id,
        mahallaName: botStat.mahallaName,
        targetReached: botStat.isTargetReached,
        sent: botSent,
        failed: botFailed,
      });

      this.logger.log(`📢 [Bot #${botStat.id}] ${botStat.mahallaName}: ${botSent} ta xabar muvaffaqiyatli yuborildi.`);
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(`✅ [Marketing Broadcast]: Jami ${allBotsRecords.length} ta bot orqali ${totalSent} ta xabar yuborildi (${durationMs}ms).`);

    // DB Tarixiga saqlash (Audit / History)
    await this.prisma.systemApiLog.create({
      data: {
        action: `MARKETING_${slot}`,
        httpStatus: 200,
        responseBody: `Yuborildi: ${totalSent}, Nosoz: ${totalFailed} (Vaqt: ${durationMs}ms)`,
        isSuccess: totalSent > 0,
      },
    }).catch(() => {});

    return {
      slot,
      totalBots: allBotsRecords.length,
      totalUsers: allUsers.length,
      sentCount: totalSent,
      failedCount: totalFailed,
      durationMs,
      details,
    };
  }

  /**
   * Dinamik, qiziqarli va mahalla rejasiga mos xabar va tugmalar yaratish
   */
  private buildMarketingMessage(
    currentBot: any,
    otherActiveBots: any[],
    slot: 'MORNING' | 'EVENING' | 'TEST',
  ) {
    const reward = (currentBot.voteReward || 30000).toLocaleString('uz-UZ');
    const mahalla = currentBot.mahallaName;
    const isStoppedOrTargetReached = !currentBot.isActive || currentBot.status === 'STOPPED' || currentBot.status === 'ARCHIVED' || currentBot.isTargetReached;

    // 1-HOLAT: Agar bot to'xtatilgan, arxivlangan yoki rejasi to'lgan bo'lsa -> Boshqa faol botlarni reklama qilish (Cross-Promotion)
    if (isStoppedOrTargetReached) {
      if (otherActiveBots.length > 0) {
        const inlineButtons: any[] = otherActiveBots.map((ob) => {
          const uName = ob.botUsername ? ob.botUsername.replace('@', '') : ob.name;
          const rew = (ob.voteReward || 30000).toLocaleString('uz-UZ');
          return [Markup.button.url(`🚀 ${ob.mahallaName} (+${rew} so'm) ➔`, `https://t.me/${uName}`)];
        });
        inlineButtons.push([Markup.button.callback('💳 Balans va Pul Yechish', 'withdraw_menu')]);

        let promoText = '';
        if (slot === 'MORNING') {
          promoText =
            `🌅 <b>Xayrli tong, aziz yurtdosh!</b>\n\n` +
            `🔥 <b>Yangi mahallalarimizda ovoz berish davom etmoqda!</b>\n\n` +
            `"${mahalla}" bo'yicha ovoz yig'ish yakunlangan. Lekin siz boshqa faol mahallalarimiz botlariga o'tib, har bir ovoz uchun <b>30 000 so'm</b> mukofot olishingiz mumkin!\n\n` +
            `O'zingiz va yaqinlaringiz raqamlaridan ovoz berib, pul ishlashda davom eting! 👇`;
        } else if (slot === 'AFTERNOON' as any) {
          promoText =
            `☀️ <b>Kuningiz unumli o'tsin! Yangi daromad imkoniyati!</b>\n\n` +
            `💰 <b>Har bir ovoz uchun +30 000 so'm kafolatlangan mukofot!</b>\n\n` +
            `Quyidagi yangi faol mahallamiz botiga o'tib, ovoz bering va daromadingizni kartangizga yechib oling 👇`;
        } else if (slot === 'NIGHT' as any) {
          promoText =
            `🌙 <b>Bugungi kunni qo'shimcha daromad bilan yakunlang!</b>\n\n` +
            `⚡️ Yangi mahallalarimizda ovoz berish qizg'in davom etmoqda! Har bir ovoz uchun: <b>30 000 so'm</b>!\n\n` +
            `Hoziroq pastdagi yangi botimizga o'ting va mukofotingizni oling 👇`;
        } else {
          promoText =
            `🌆 <b>Kechki eslatma: Yangi mahallaga ovoz bering va pul ishlang!</b>\n\n` +
            `📌 <b>${mahalla}</b> boti bo'yicha ovoz qabul qilish yakunlandi.\n\n` +
            `🚀 Hozirda yangi mahallamizda ovoz qabul qilinmoqda. Har bir ovoz uchun <b>+30 000 so'm</b> to'lanadi!\n\n` +
            `Ovoz berish uchun pastdagi yangi botga o'ting 👇`;
        }

        return { text: promoText, keyboard: Markup.inlineKeyboard(inlineButtons) };
      } else {
        const text =
          `🏆 <b>Barcha mahallalarimiz o'z maqsadiga to'liq yetdi!</b> 🎉\n\n` +
          `Sizning balansingizda mablag'ingiz bo'lsa, istalgan vaqtda <b>"💸 Pulni yechib olish"</b> orqali kartangizga yechib olishingiz mumkin.\n\n` +
          `Faolligingiz uchun katta rahmat!`;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('💳 Balans va Pul Yechish', 'withdraw_menu')],
        ]);

        return { text, keyboard };
      }
    }

    // 2-HOLAT: Agar joriy mahalla faol ishlayotgan bo'lsa
    if (slot === 'MORNING') {
      const text =
        `🌅 <b>Xayrli tong, aziz yurtdosh!</b>\n\n` +
        `🔥 <b>Open Budgetda ovoz berib, kafolatlangan daromad oling!</b>\n\n` +
        `📍 Mahalla: <b>${mahalla}</b>\n` +
        `💰 Har bir ovoz uchun to'lov: <b>${reward} so'm</b> (Darhol Uzcard / Humo kartangizga)\n` +
        `👥 Oila a'zolaringiz va yaqinlaringiz raqamlaridan ham ovoz berib pul ishlashingiz mumkin!\n\n` +
        `Hoziroq "🗳 Ovoz berish" tugmasini bosing va mukofotingizni oling 👇`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(`🗳 Ovoz berish (+${reward} so'm)`, 'start_vote')],
        [Markup.button.callback('💰 Balansimni tekshirish', 'refresh_balance')],
      ]);

      return { text, keyboard };
    } else if (slot === 'AFTERNOON' as any) {
      const text =
        `☀️ <b>Kuningiz unumli o'tsin!</b>\n\n` +
        `💡 <b>Ovozingiz hali ham kutilmoqda!</b> Atigi 1 daqiqa ajratib, o'z mahallangiz rivojiga hissa qo'shing va <b>${reward} so'm</b> mukofot oling!\n\n` +
        `📍 Mahalla: <b>${mahalla}</b>\n` +
        `⚡️ To'lovlar 100% kafolatlangan va tasdiqlangach avtomatik kartangizga o'tkaziladi.\n\n` +
        `Ovoz berishni davom ettirish uchun bosing 👇`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(`🗳 Hoziroq ovoz berish (+${reward} so'm)`, 'start_vote')],
        [Markup.button.callback('👥 Do\'stlarni taklif qilish (+5 000 so\'m)', 'ref_menu')],
      ]);

      return { text, keyboard };
    } else if (slot === 'NIGHT' as any) {
      const text =
        `🌙 <b>Bugungi kunni qo'shimcha daromad bilan yakunlang!</b>\n\n` +
        `⏳ <b>${mahalla}</b> bo'yicha bugungi ovozlar soni cheklangan!\n\n` +
        `💰 Har bir ovoz uchun: <b>${reward} so'm</b>\n` +
        `📲 Telefoningiz orqali hoziroq ovoz bering va daromadingizni yechib oling!\n\n` +
        `Pastdagi tugmani bosing 👇`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(`🗳 Ovoz berish (+${reward} so'm)`, 'start_vote')],
        [Markup.button.callback('💳 Balans va Pul Yechish', 'withdraw_menu')],
      ]);

      return { text, keyboard };
    } else {
      // EVENING yoki TEST
      const text =
        `🌆 <b>Xayrli kech! Bugungi imkoniyatni boy bermang!</b>\n\n` +
        `⚡️ <b>${mahalla}</b> bo'yicha ovoz berish jarayoni qizg'in davom etmoqda!\n\n` +
        `📍 Mahalla: <b>${mahalla}</b>\n` +
        `💰 Ovoz mukofoti: <b>${reward} so'm</b> (Uzcard / Humo)\n` +
        `👥 Yaqinlaringiz nomidagi barcha raqamlardan ham ovoz berib, balansingizni to'ldiring!\n\n` +
        `Ovoz berish uchun pastdagi tugmani bosing 👇`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(`🗳 Hoziroq ovoz berish (+${reward} so'm)`, 'start_vote')],
        [Markup.button.callback('💳 Pulni yechib olish', 'withdraw_menu')],
      ]);

      return { text, keyboard };
    }
  }

  /**
   * Reklama va Bannerli maxsus xabar yuborish (Rasm, formatlangan matn va inline tugma bilan)
   */
  public async executeCustomAdBroadcast(params: {
    text: string;
    photoBase64OrUrl?: string;
    buttonText?: string;
    buttonUrl?: string;
    buttons?: Array<{ text: string; url: string }>;
    targetBotId?: number;
  }): Promise<{
    sentCount: number;
    failedCount: number;
    durationMs: number;
  }> {
    const startTime = Date.now();
    const allUsers = await this.prisma.user.findMany({
      where: {
        isBanned: false,
        telegramId: { notIn: ['0', ''] },
        ...(params.targetBotId ? { botInstanceId: params.targetBotId } : {}),
      },
    });

    const firstActiveBot = this.botManager.getFirstActiveBot();

    let totalSent = 0;
    let totalFailed = 0;

    // Ko'p sonli dinamik Inline tugmalar
    let inlineKeyboard: any = undefined;
    const allButtons: Array<{ text: string; url: string }> = [];

    if (Array.isArray(params.buttons) && params.buttons.length > 0) {
      for (const btn of params.buttons) {
        if (btn.text && btn.url) {
          allButtons.push({ text: btn.text.trim(), url: btn.url.trim() });
        }
      }
    } else if (params.buttonText && params.buttonUrl) {
      allButtons.push({ text: params.buttonText.trim(), url: params.buttonUrl.trim() });
    }

    if (allButtons.length > 0) {
      inlineKeyboard = Markup.inlineKeyboard(
        allButtons.map((btn) => {
          const u = btn.url.trim();
          if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('t.me/')) {
            const finalUrl = u.startsWith('t.me/') ? `https://${u}` : u;
            return [Markup.button.url(btn.text, finalUrl)];
          } else {
            // Callback action (masalan: start_vote, withdraw_menu, referral_link, refresh_balance)
            const actionName = u.replace(/^action:/, '');
            return [Markup.button.callback(btn.text, actionName)];
          }
        })
      );
    }

    // Rasm fayli yoki URL
    let photoBufferOrUrl: any = undefined;
    if (params.photoBase64OrUrl) {
      if (params.photoBase64OrUrl.startsWith('data:image')) {
        const base64Data = params.photoBase64OrUrl.replace(/^data:image\/\w+;base64,/, '');
        photoBufferOrUrl = { source: Buffer.from(base64Data, 'base64') };
      } else {
        photoBufferOrUrl = params.photoBase64OrUrl;
      }
    }

    for (const user of allUsers) {
      let botToUse: any = user.botInstanceId ? this.botManager.getActiveBot(user.botInstanceId) : null;
      if (!botToUse) botToUse = firstActiveBot;

      if (!botToUse) {
        totalFailed++;
        continue;
      }

      try {
        if (photoBufferOrUrl) {
          await botToUse.bot.telegram.sendPhoto(user.telegramId, photoBufferOrUrl, {
            caption: params.text,
            parse_mode: 'HTML',
            ...(inlineKeyboard || {}),
          });
        } else {
          await botToUse.bot.telegram.sendMessage(user.telegramId, params.text, {
            parse_mode: 'HTML',
            ...(inlineKeyboard || {}),
          });
        }
        totalSent++;
      } catch (err: any) {
        // Agar Telegram HTML formatlashda xatolik bersa (unclosed tag va h.k.), teglarsiz oddiy matn sifatida qayta urinib ko'ramiz
        if (err.description?.includes('parse entities') || err.message?.includes('parse entities')) {
          try {
            const strippedText = params.text.replace(/<[^>]*>?/gm, '');
            if (photoBufferOrUrl) {
              await botToUse.bot.telegram.sendPhoto(user.telegramId, photoBufferOrUrl, {
                caption: strippedText,
                ...(inlineKeyboard || {}),
              });
            } else {
              await botToUse.bot.telegram.sendMessage(user.telegramId, strippedText, {
                ...(inlineKeyboard || {}),
              });
            }
            totalSent++;
            continue;
          } catch (e2: any) {
            err = e2;
          }
        }

        totalFailed++;
        this.logger.warn(`⚠️ Reklama yetkazilmadi [User ID: ${user.telegramId} (@${user.username || 'noma\'lum'})]: ${err.description || err.message}`);
        if (err.description?.includes('blocked') || err.description?.includes('deactivated') || err.description?.includes('chat not found')) {
          await this.prisma.user.update({
            where: { id: user.id },
            data: { isBanned: true },
          }).catch(() => {});
        }
      }

      // Telegram Flood Limit: 35ms oralig'i
      await new Promise((r) => setTimeout(r, 35));
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(`📢 [Custom Ad Broadcast]: Jami ${allUsers.length} foydalanuvchidan ${totalSent} tasiga reklama yetkazildi (${totalFailed} ta xato, ${durationMs}ms).`);

    // DB Tarixiga saqlash (Audit / History)
    let targetMahallaName = 'Barcha Mahallalar';
    if (params.targetBotId) {
      const targetBotRecord = await this.prisma.botInstance.findUnique({ where: { id: params.targetBotId } }).catch(() => null);
      if (targetBotRecord) targetMahallaName = targetBotRecord.mahallaName;
    }

    await this.prisma.broadcastMessage.create({
      data: {
        type: 'CUSTOM_AD',
        targetBotId: params.targetBotId || null,
        targetMahallaName,
        text: params.text,
        photoUrl: params.photoBase64OrUrl && !params.photoBase64OrUrl.startsWith('data:') ? params.photoBase64OrUrl : (params.photoBase64OrUrl ? '[Yuklangan Banner Rasmi]' : null),
        buttonsJson: JSON.stringify(allButtons),
        totalUsers: allUsers.length,
        sentCount: totalSent,
        failedCount: totalFailed,
        durationMs,
        status: totalSent > 0 ? 'COMPLETED' : 'FAILED',
      },
    }).catch(() => {});

    return {
      sentCount: totalSent,
      failedCount: totalFailed,
      durationMs,
    };
  }

  /**
   * Barcha yuborilgan xabarnomalar va reklamalar tarixini olish
   */
  public async getBroadcastHistory() {
    return this.prisma.broadcastMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
