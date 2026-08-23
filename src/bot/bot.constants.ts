export const formatSum = (amount: number | string): string => {
  if (amount === undefined || amount === null) return '0';
  const num = typeof amount === 'string' ? parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0 : amount;
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

export const BOT_MESSAGES = {
  START: (reward: number = 30000, refBonus: number = 5000) => 
    `🇺🇿 <b>OCHIQ BUDJET 2026 | RASMIY BOT</b>\n\n` +
    `⚡️ <b>O'z ovozingizni bering va kafolatlangan mukofotga ega bo'ling!</b>\n\n` +
    `💰 <b>Har bir ovoz uchun:</b> <code>+${formatSum(reward)} so'm</code>\n` +
    `👥 <b>Har bir taklif qilingan do'st uchun:</b> <code>+${formatSum(refBonus)} so'm</code>\n\n` +
    `📌 <b>Asosiy qoidalar:</b>\n` +
    `• Bitta pasport nomiga rasmiylashtirilgan barcha raqamlardan faqat <b>1 marta</b> ovoz berish mumkin.\n` +
    `• To'lovlar ovoz tizimda tasdiqlangach avtomatik hisobingizga o'tkaziladi.\n\n` +
    `👇 <b>Ovoz berish uchun pastdagi tugmani bosing:</b>`,

  VOTE_PROMPT: 
    `📱 <b>OVOZ BERISH UCHUN RAQAMNI KIRITING:</b>\n\n` +
    `Telefon raqamingizni quyidagi ko'rinishda yuboring:\n` +
    `👉 <code>901234567</code> yoki <code>+998901234567</code>\n\n` +
    `<i>Yoki pastdagi «📱 Kontaktni yuborish» tugmasini bosing.</i>`,

  WAITING: `⏳ <b>Biroz kuting...</b>\n\nSo'rovingiz yuborilmoqda 🚀`,

  SMS_SENT: (phone: string) => 
    `📩 <b>SMS KOD YUBORILDI!</b>\n\n` +
    `<b>+${phone}</b> raqamingizga 6 xonali tasdiqlash kodi yuborildi.\n\n` +
    `Kodni quyida yozib yuboring (Masalan: <code>123456</code>) 👇`,

  VOTE_SUBMITTED_PENDING: (phone: string, reward: number = 30000, mahallaName?: string) =>
    `✅ <b>OVOZINGIZ MUVAFFAQIYATLI QABUL QILINDI!</b>\n\n` +
    (mahallaName ? `📍 <b>Loyiha:</b> ${mahallaName}\n` : '') +
    `📱 <b>Telefon:</b> +${phone}\n` +
    `⏳ <b>Holati:</b> Tekshiruvda\n` +
    `💰 <b>Mukofot:</b> <code>+${formatSum(reward)} so'm</code>\n\n` +
    `ℹ️ Ovozingiz OpenBudget rasmiy reyestrida tasdiqlangach, hisobingizga avtomatik mablag' o'tkaziladi va sizga alohida xabar yuboriladi. Odatda bu bir necha daqiqa ichida amalga oshadi. ⚡️`,

  VOTE_VERIFIED_ALERT: (phone: string, reward: number, balance: number) => 
    `🎉 <b>TABRIKLAYMIZ! OVOZINGIZ TASDIQLANDI!</b>\n\n` +
    `📱 <b>Raqam:</b> +${phone}\n` +
    `💰 <b>Qo'shildi:</b> <code>+${formatSum(reward)} so'm</code>\n` +
    `💳 <b>Joriy balansingiz:</b> <code>${formatSum(balance)} so'm</code>\n\n` +
    `Do'stlaringizni taklif qiling va har bir do'stingiz uchun <b>+5 000 so'm</b> bonus oling! 🚀`,

  BALANCE: (balance: number, referralsCount: number, votesCount: number, pendingVotesCount: number, totalWithdrawn: number, pendingReward: number = 30000) => 
    `💰 <b>SIZNING SHAXSIY HISOBINGIZ:</b>\n\n` +
    `💳 <b>Mavjud asosiy balans:</b> <code>${formatSum(balance)} so'm</code>\n` +
    `🗳 <b>Tasdiqlangan ovozlar:</b> <code>${formatSum(votesCount)} ta</code>\n` +
    `⏳ <b>Kutilayotgan ovozlar:</b> <code>${formatSum(pendingVotesCount)} ta</code> (<code>${formatSum(pendingVotesCount * pendingReward)} so'm</code>)\n` +
    `👥 <b>Taklif qilingan do'stlar:</b> <code>${formatSum(referralsCount)} ta</code>\n` +
    `💸 <b>Jami yechib olingan:</b> <code>${formatSum(totalWithdrawn)} so'm</code>\n\n` +
    `📌 <i>Minimal yechish summasi: 10 000 so'm.</i>`,

  REFERRAL: (refLink: string, count: number, bonus: number = 5000) => 
    `🔗 <b>SIZNING REFERAL HAVOLANGIZ:</b>\n\n` +
    `<code>${refLink}</code>\n\n` +
    `👥 <b>Taklif qilinganlar:</b> <code>${formatSum(count)} ta</code>\n` +
    `🎁 <b>Har bir do'stingiz uchun:</b> <code>+${formatSum(bonus)} so'm</code>\n\n` +
    `<i>Ushbu havolani do'stlaringizga va guruhlarga yuboring hamda qo'shimcha daromad oling! 🚀</i>`,

  WITHDRAW_CHOOSE_METHOD: (balance: number, min: number) => 
    `💸 <b>PUL YECHIB OLISH:</b>\n\n` +
    `💳 <b>Mavjud balansingiz:</b> <code>${formatSum(balance)} so'm</code>\n` +
    `⚠️ <b>Minimal yechish summasi:</b> <code>${formatSum(min)} so'm</code>\n\n` +
    `Pulni yechish uchun to'lov turini tanlang 👇`,

  WITHDRAW_ENTER_AMOUNT: (method: string, balance: number, min: number) => 
    `💳 <b>To'lov usuli:</b> ${method === 'PAYNET' ? '📱 Paynet' : '💳 Uzcard / Humo'}\n` +
    `💰 <b>Mavjud balans:</b> <code>${formatSum(balance)} so'm</code>\n\n` +
    `Qancha yechmoqchisiz? (Minimal: <code>${formatSum(min)} so'm</code>)\n` +
    `Summani yozib yuboring (Masalan: <code>${formatSum(balance)}</code>):`,

  WITHDRAW_ENTER_ACCOUNT: (method: string) => method === 'PAYNET' 
    ? `📱 <b>Paynet uchun telefon raqamingizni yuboring:</b>\n(Masalan: <code>901234567</code>)` 
    : `💳 <b>Uzcard yoki Humo karta raqamingizni kiriting:</b>\n16 ta raqam ko'rinishida yuboring (Masalan: <code>8600123456789012</code>)`,

  WITHDRAW_CONFIRMATION: (amount: number, method: string, account: string) => 
    `✅ <b>PUL YECHISH SO'ROVI QABUL QILINDI!</b>\n\n` +
    `💸 <b>Summa:</b> <code>${formatSum(amount)} so'm</code>\n` +
    `💳 <b>To'lov turi:</b> ${method}\n` +
    `📝 <b>Hisob:</b> <code>${account}</code>\n` +
    `⏳ <b>Holati:</b> Kutilmoqda (Tez orada o'tkazib beriladi)\n\n` +
    `<i>So'rovingiz navbat bo'yicha ko'rib chiqiladi!</i>`,

  MUST_SUBSCRIBE: `⚠️ <b>Botdan foydalanish uchun quyidagi kanallarga obuna bo'ling:</b>`,
};

export const BOT_BUTTONS = {
  VOTE: '🗳 Ovoz berish',
  BALANCE: '💰 Balans',
  WITHDRAW: '💸 Pulni yechib olish',
  REFERRAL: '🔗 Referal ssilka',
  CONTACT: '📞 Bog\'lanish',
  AGENT_CABINET: '💼 Agent Kabineti',
  ADMIN_PANEL: '👑 Admin panel',
};
