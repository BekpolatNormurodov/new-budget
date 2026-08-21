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
    this.logger.log('📢 Avtomatik Kunlik Marketing & Eslatma Tizimi faollashtirildi (09:00 va 17:00).');
  }

  onModuleDestroy() {
    if (this.scheduleIntervalHandle) {
      clearInterval(this.scheduleIntervalHandle);
    }
  }

  /**
   * Kunlik 2 martalik rejalashtiruvchi (Ertalab 09:00 va Kechqurun 17:00 - Toshkent vaqti bilan)
   */
  private startDailyScheduler() {
    this.scheduleIntervalHandle = setInterval(async () => {
      try {
        const now = new Date();
        // Toshkent vaqti (UTC+5)
        const tashkentHours = (now.getUTCHours() + 5) % 24;
        const tashkentMinutes = now.getUTCMinutes();
        const dateStr = now.toISOString().slice(0, 10);

        // Ertalabki xabar (09:00 - 09:05)
        if (tashkentHours === 9 && tashkentMinutes <= 5) {
          const slotKey = `${dateStr}_MORNING`;
          if (this.lastExecutedKey !== slotKey) {
            this.lastExecutedKey = slotKey;
            this.logger.log('🌅 Ertalabki (09:00) marketing xabarlari yuborilmoqda...');
            await this.executeBroadcast('MORNING');
          }
        }

        // Kechki xabar (17:00 - 17:05)
        if (tashkentHours === 17 && tashkentMinutes <= 5) {
          const slotKey = `${dateStr}_EVENING`;
          if (this.lastExecutedKey !== slotKey) {
            this.lastExecutedKey = slotKey;
            this.logger.log('🌆 Kechki (17:00) marketing xabarlari yuborilmoqda...');
            await this.executeBroadcast('EVENING');
          }
        }
      } catch (err: any) {
        this.logger.error(`Scheduler xatoligi: ${err.message}`);
      }
    }, 60000); // Har daqiqada tekshiradi
  }

  /**
   * Xabarlarni yuborishni bajarish (Ertalabki, Kechki yoki Test)
   */
  public async executeBroadcast(slot: 'MORNING' | 'EVENING' | 'TEST' = 'TEST'): Promise<BroadcastResult> {
    const startTime = Date.now();
    const activeBotsRecords = await this.prisma.botInstance.findMany({
      where: { isActive: true },
    });

    // 1. Faol botlar statistikasini hisoblash
    const botStatsList = await Promise.all(
      activeBotsRecords.map(async (b) => {
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

    const unfinishedBot = botStatsList.find((b) => !b.isTargetReached);
    const firstActiveBot = this.botManager.getFirstActiveBot();

    // 2. Bazadagi barcha haqiqiy foydalanuvchilarni olish (isBanned: false va telegramId !== '0')
    const allUsers = await this.prisma.user.findMany({
      where: {
        isBanned: false,
        telegramId: { notIn: ['0', ''] },
      },
    });

    let totalSent = 0;
    let totalFailed = 0;
    const sentMapByBot = new Map<number, { sent: number; failed: number; name: string; targetReached: boolean }>();

    for (const user of allUsers) {
      // Foydalanuvchiga mos botni aniqlash
      let botToUse: any = user.botInstanceId ? this.botManager.getActiveBot(user.botInstanceId) : null;
      let botStat: any = user.botInstanceId ? botStatsList.find((b) => b.id === user.botInstanceId) : null;

      if (!botToUse || !botStat) {
        botToUse = firstActiveBot;
        botStat = botStatsList[0] || {
          id: botToUse?.id || 1,
          name: 'Open Budget Bot',
          mahallaName: 'Navbahor MFY',
          voteReward: 30000,
          targetVotes: 5000,
          remaining: 1000,
          isTargetReached: false,
        };
      }

      if (!botToUse) {
        this.logger.warn(`Hech qanday faol bot topilmadi, foydalanuvchiga (${user.telegramId}) xabar yuborib bo'lmadi.`);
        totalFailed++;
        continue;
      }

      const { text, keyboard } = this.buildMarketingMessage(botStat, unfinishedBot, slot);

      try {
        await botToUse.bot.telegram.sendMessage(user.telegramId, text, {
          parse_mode: 'HTML',
          ...keyboard,
        });
        totalSent++;

        const currentCount = sentMapByBot.get(botStat.id) || {
          sent: 0,
          failed: 0,
          name: botStat.mahallaName || botStat.name,
          targetReached: botStat.isTargetReached || false,
        };
        currentCount.sent++;
        sentMapByBot.set(botStat.id, currentCount);
      } catch (err: any) {
        totalFailed++;
        const currentCount = sentMapByBot.get(botStat.id) || {
          sent: 0,
          failed: 0,
          name: botStat.mahallaName || botStat.name,
          targetReached: botStat.isTargetReached || false,
        };
        currentCount.failed++;
        sentMapByBot.set(botStat.id, currentCount);

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

    const details: BroadcastResult['details'] = Array.from(sentMapByBot.entries()).map(([botId, data]) => ({
      botId,
      mahallaName: data.name,
      targetReached: data.targetReached,
      sent: data.sent,
      failed: data.failed,
    }));

    const durationMs = Date.now() - startTime;
    this.logger.log(`✅ [Marketing Broadcast]: Jami ${allUsers.length} ta foydalanuvchidan ${totalSent} tasiga xabar yetkazildi (${totalFailed} ta xato, ${durationMs}ms).`);

    return {
      slot,
      totalBots: activeBotsRecords.length,
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
    fallbackUnfinishedBot: any | undefined,
    slot: 'MORNING' | 'EVENING' | 'TEST',
  ) {
    const reward = (currentBot.voteReward || 30000).toLocaleString('uz-UZ');
    const mahalla = currentBot.mahallaName;

    // 1-HOLAT: Agar joriy mahalla rejasiga hali YETMAGAN bo'lsa (Target not reached)
    if (!currentBot.isTargetReached) {
      if (slot === 'MORNING') {
        const text =
          `🌅 <b>Xayrli tong, aziz yurtdosh!</b>\n\n` +
          `🔥 <b>Open Budgetda ovoz berib, qo'shimcha daromad oling!</b>\n\n` +
          `📍 Mahalla: <b>${mahalla}</b>\n` +
          `💰 Har bir ovoz uchun to'lov: <b>${reward} so'm</b> (Darhol kartaga / paynetga)\n` +
          `👥 Oila a'zolaringiz va yaqinlaringiz raqamlaridan ham ovoz berib pul ishlashingiz mumkin!\n\n` +
          `Hoziroq "🗳 Ovoz berish" tugmasini bosing va o'z mukofotingizni oling 👇`;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback(`🗳 Ovoz berish (+${reward} so'm)`, 'start_vote')],
          [Markup.button.callback('💰 Balansimni tekshirish', 'refresh_balance')],
        ]);

        return { text, keyboard };
      } else {
        // EVENING yoki TEST
        const text =
          `🌆 <b>Xayrli kech! Bugungi imkoniyatni qo'ldan boy bermang!</b>\n\n` +
          `⚡️ <b>${mahalla}</b> bo'yicha ovoz berish jarayoni davom etmoqda!\n\n` +
          `📍 Mahalla: <b>${mahalla}</b>\n` +
          `💰 Ovoz mukofoti: <b>${reward} so'm</b>\n` +
          `👥 Yaqinlaringiz nomidagi raqamlardan ham ovoz berib, balansingizni to'ldiring!\n\n` +
          `Ovoz berish uchun pastdagi tugmani bosing 👇`;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback(`🗳 Hoziroq ovoz berish (+${reward} so'm)`, 'start_vote')],
          [Markup.button.callback('💳 Pulni yechib olish', 'withdraw_menu')],
        ]);

        return { text, keyboard };
      }
    }

    // 2-HOLAT: Agar joriy mahalla REJASIDAN O'TGAN / TO'LGAN bo'lsa (Target reached -> Cross-Promotion)
    if (fallbackUnfinishedBot && fallbackUnfinishedBot.id !== currentBot.id) {
      const nextMahalla = fallbackUnfinishedBot.mahallaName;
      const nextReward = (fallbackUnfinishedBot.voteReward || 30000).toLocaleString('uz-UZ');
      const nextBotUsername = fallbackUnfinishedBot.botUsername || fallbackUnfinishedBot.name;

      const text =
        `🎉 <b>Ajoyib yangilik! ${mahalla} o'zining barcha rejasini muvaffaqiyatli bajardi!</b> 🥳\n\n` +
        `Hammaga faollik uchun katta rahmat!\n\n` +
        `🚀 <b>Lekin pul ishlash to'xtamaydi!</b> Hozirda bizning yana bir mahallamizda ovoz qabul qilinmoqda:\n\n` +
        `📍 Mahalla: <b>${nextMahalla}</b>\n` +
        `💰 Har bir ovoz uchun to'lov: <b>${nextReward} so'm</b>!\n\n` +
        `Barcha yangi va yaqinlaringiz raqamlari bilan quyidagi botimizda ovoz berib, yana pul ishlashda davom eting 👇`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.url(`🚀 Botga o'tish (@${nextBotUsername})`, `https://t.me/${nextBotUsername}`)],
        [Markup.button.callback('💳 Balansimni yechib olish', 'withdraw_menu')],
      ]);

      return { text, keyboard };
    }

    // Agar hamma mahallalar rejasini to'liq bajargan bo'lsa
    const text =
      `🏆 <b>Tabriklaymiz! Barcha mahallalarimiz o'z maqsadiga to'liq yetdi!</b> 🎉\n\n` +
      `Sizning balansingizda mablag'ingiz bo'lsa, istalgan vaqtda kartangizga yoki Paynet orqali yechib olishingiz mumkin.\n\n` +
      `Faolligingiz uchun minnatdormiz!`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('💰 Balans va Pul Yechish', 'refresh_balance')],
    ]);

    return { text, keyboard };
  }
}
