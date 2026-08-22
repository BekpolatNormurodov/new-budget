import { Markup } from 'telegraf';
import { BOT_BUTTONS } from './bot.constants';

export class BotKeyboards {
  /**
   * Asosiy menyu klaviaturasi (Mobil Telegram uchun ideal simmetrik joylashuv)
   */
  static mainMenu(_isAdmin: boolean = false, isAgent: boolean = false) {
    const buttons = [
      [BOT_BUTTONS.VOTE],
      [BOT_BUTTONS.BALANCE, BOT_BUTTONS.WITHDRAW],
      [BOT_BUTTONS.REFERRAL, BOT_BUTTONS.CONTACT],
    ];

    if (isAgent) {
      buttons.push([BOT_BUTTONS.AGENT_CABINET]);
    }

    return Markup.keyboard(buttons).resize();
  }

  /**
   * Telefon raqamni yuborish klaviaturasi (kontakt ulashish tugmasi bilan)
   */
  static phoneRequestKeyboard() {
    return Markup.keyboard([
      [Markup.button.contactRequest('📱 Kontaktni yuborish')],
    ]).resize();
  }

  /**
   * Ovoz berish variantlari inline klaviaturasi (Web App + Brauzer)
   */
  static voteOptionsInline(initiativeUuid?: string, boardId: number | string = 55) {
    const webUrl = initiativeUuid
      ? `https://openbudget.uz/boards/initiatives/initiative/${boardId}/${initiativeUuid}`
      : 'https://openbudget.uz/';
    
    return Markup.inlineKeyboard([
      [
        Markup.button.webApp('🗳 Ochiq Budjetda Ovoz Berish (Web)', webUrl),
      ],
      [
        Markup.button.url('🌐 Rasmiy saytda ochish', webUrl),
      ],
    ]);
  }

  /**
   * SMS kutish jarayonidagi inline tugma (Qayta SMS so'rash)
   */
  static smsWaitingInline() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🔄 SMS kelmadimi? Qaytadan yuborish', 'resend_sms')],
    ]);
  }

  /**
   * Pul yechish to'lov usullari inline tugmalari
   */
  static withdrawMethodsInline() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('💳 Uzcard / Humo (Kartaga yechish)', 'withdraw_method_CARD')],
      [Markup.button.callback('📱 Paynet (Telefon raqamga)', 'withdraw_method_PAYNET')],
    ]);
  }

  /**
   * Referal bo'limi inline tugmalari
   */
  static referralInline(botUsername: string, refCode: string) {
    const shareText = encodeURIComponent(
      `🔥 Ochiq Budjetda ovoz berib pul ishlang! Har bir ovoz uchun 200,000 so'mgacha mukofot!\n\nHoziroq kiring: https://t.me/${botUsername}?start=ref_${refCode}`
    );
    return Markup.inlineKeyboard([
      [
        Markup.button.url(
          '↗️ Do\'stlarga ulashish',
          `https://t.me/share/url?url=https://t.me/${botUsername}?start=ref_${refCode}&text=${shareText}`
        ),
      ],
      [
        Markup.button.callback('📊 Takliflar statistikasi', 'referral_stats'),
        Markup.button.callback('🔄 Yangilash', 'refresh_balance'),
      ],
    ]);
  }

  /**
   * Balans bo'limi inline tugmalari
   */
  static balanceInline() {
    const rows: any[][] = [
      [
        Markup.button.callback('💸 Pul yechish', 'start_withdraw'),
        Markup.button.callback('🔄 Yangilash', 'refresh_balance'),
      ],
    ];

    return Markup.inlineKeyboard(rows as any);
  }

  /**
   * Admin paneli inline menyusi
   */
  static adminMenuInline() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('📊 Jonli Statistika', 'admin_stats'),
        Markup.button.callback('💳 Pul yechish arizalari', 'admin_withdrawals'),
      ],
      [
        Markup.button.callback('📢 Xabar yuborish (Broadcast)', 'admin_broadcast'),
        Markup.button.callback('📢 Homiy kanallar', 'admin_channels'),
      ],
      [
        Markup.button.callback('⚙️ Narxlar va Sozlamalar', 'admin_settings'),
        Markup.button.callback('🗳 Tashabbuslar', 'admin_initiatives'),
      ],
      [Markup.button.callback('🔙 Asosiy menyu', 'back_to_main')],
    ]);
  }

  /**
   * Admin uchun pul yechish arizasini tasdiqlash/rad etish tugmalari
   */
  static adminWithdrawalAction(withdrawalId: number) {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Tasdiqlash (To\'landi)', `adm_app_${withdrawalId}`),
        Markup.button.callback('❌ Rad etish (Qaytarish)', `adm_rej_${withdrawalId}`),
      ],
    ]);
  }

  /**
   * Homiy kanallar tekshiruvi inline tugmalari
   */
  static sponsorChannelsInline(channels: { title: string; inviteLink: string }[]) {
    const rows: any[][] = channels.map((c, i) => [
      Markup.button.url(`📢 ${i + 1}-Kanalga a'zo bo'lish`, c.inviteLink),
    ]);
    rows.push([Markup.button.callback('✅ A\'zo bo\'ldim (Tekshirish)', 'check_subscription')]);
    return Markup.inlineKeyboard(rows as any);
  }
}
