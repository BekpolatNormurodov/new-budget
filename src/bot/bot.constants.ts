export const formatSum = (amount: number | string): string => {
  if (amount === undefined || amount === null) return '0';
  const num = typeof amount === 'string' ? parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0 : amount;
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

export const BOT_MESSAGES = {
  START: (reward: number = 30000, refBonus: number = 5000) => `📢 Aziz foydalanuvchi!

VAQT JUDA OZ QOLDI⭕️

Siz har bir bergan OVOZINGIZ uchun
${formatSum(reward)} so'm mukofot olish imkoniyatiga egasiz! 💸

🔥 Bu imkoniyat orqali oddiygina ovoz berib tez va oson pul ishlashingiz mumkin.

👥 Do'stlaringizni taklif qilib har bir do'stingiz uchun +${formatSum(refBonus)} so'mdan oling!

‼️ MUHIM QOIDA: Ochiq Budjet qoidalariga ko'ra bitta pasport (shaxs) nomiga olingan barcha telefon raqamlardan faqat 1 marta ovoz berish mumkin.

💰 Ko'plab foydalanuvchilar allaqachon ovoz berib pul ishlashni boshlashdi. Siz ham ularga qo'shiling!

🚀 Ishni boshlash uchun botga telefon raqamingizni yuborishingiz kerak.

📱 Telefon raqamingizni quyidagi formatda yuboring:
901234567

⏳ Shoshiling! Ovozlar soni cheklangan.`,

  VOTE_PROMPT: `📞 Ovoz berish uchun telefon raqamni kiriting:

Telefon raqami +998991234567 yoki 991234567 formatida kiritilishi kerak.

📌 DIQQAT: Bitta pasport nomidagi barcha raqamlardan faqat 1 marta ovoz berish mumkin.`,

  WAITING: `⏳ Kuting...`,

  SMS_SENT: (phone: string) => `📩 Telefoningizga (+${phone}) 6 xonali SMS kod yuborildi!

Iltimos, kelgan SMS kodni quyida yozib yuboring:`,

  VOTE_SUBMITTED_PENDING: (phone: string, reward: number = 30000) => `✅ Sizning ovozingiz qabul qilindi va tekshiruvga yuborildi!

📱 Telefon: +${phone}
⏳ Holat: Tekshirilmoqda
⏰ Ovozlar o'rtacha 2 soat, uzog'i 24 soat ichida Ochiq Budjet tizimi tomonidan tasdiqlanadi.

💰 Ovoz tasdiqlangach, hisobingizga +${formatSum(reward)} so'm mukofot qo'shiladi va bot orqali bildirishnoma yuboriladi! 🚀`,

  VOTE_VERIFIED_ALERT: (phone: string, reward: number, balance: number) => `🎉 Tabriklaymiz! Sizning +${phone} raqam orqali bergan ovozingiz Ochiq Budjet tizimi tomonidan muvaffaqiyatli tasdiqlandi!

💰 Hisobingizga +${formatSum(reward)} so'm qo'shildi!
💳 Hozirgi balansingiz: ${formatSum(balance)} so'm

🚀 Do'stlaringizni taklif qiling va har bir do'stingiz uchun +5 000 so'mdan bonus oling!`,

  BALANCE: (balance: number, referralsCount: number, votesCount: number, pendingVotesCount: number, totalWithdrawn: number, pendingReward: number = 30000) => `💰 Sizning hisobingiz:

💳 Asosiy balans: ${formatSum(balance)} so'm
👥 Taklif qilgan do'stlaringiz: ${formatSum(referralsCount)} ta
🗳 Tasdiqlangan ovozlar: ${formatSum(votesCount)} ta
⏳ Tekshirilayotgan ovozlar: ${formatSum(pendingVotesCount)} ta (${formatSum(pendingVotesCount * pendingReward)} so'm kutilmoqda)
💸 Jami yechib olingan: ${formatSum(totalWithdrawn)} so'm

Minimal yechish summasi: 10 000 so'm.`,

  REFERRAL: (refLink: string, count: number, bonus: number = 5000) => `🔗 Sizning shaxsiy referal havolangiz:
${refLink}

👥 Taklif qilgan do'stlaringiz: ${formatSum(count)} ta
💰 Har bir taklif qilingan do'stingiz uchun: ${formatSum(bonus)} so'm bonus beriladi!

Do'stlaringizga ulashing va birgalikda pul ishlang! 🚀`,

  WITHDRAW_CHOOSE_METHOD: (balance: number, min: number) => `💸 <b>PUL YECHIB OLISH BO'LIMI:</b>\n\n` +
    `💳 <b>Sizning balansingiz:</b> ${formatSum(balance)} so'm\n` +
    `⚠️ <b>Minimal yechish summasi:</b> ${formatSum(min)} so'm\n\n` +
    `Pulni yechish uchun quyidagi to'lov usulini tanlang 👇`,

  WITHDRAW_ENTER_AMOUNT: (method: string, balance: number, min: number) => `💳 <b>To'lov usuli:</b> ${method === 'PAYNET' ? 'Paynet' : 'Uzcard / Humo'}\n` +
    `💰 <b>Mavjud balansingiz:</b> ${formatSum(balance)} so'm\n\n` +
    `Qancha summa yechmoqchisiz? (Minimal: ${formatSum(min)} so'm)\n` +
    `Raqam ko'rinishida yozib yuboring (masalan: <code>${formatSum(balance)}</code> yoki <code>${formatSum(min)}</code>):`,

  WITHDRAW_ENTER_ACCOUNT: (method: string) => method === 'PAYNET' 
    ? `📱 <b>Paynet uchun telefon raqamingizni yuboring:</b>\n(Masalan: <code>901234567</code>):` 
    : `💳 <b>Uzcard yoki Humo plastik karta raqamingizni kiriting:</b>\n16 ta raqam ko'rinishida yuboring (masalan: <code>8600 1234 5678 9012</code>):`,

  WITHDRAW_CONFIRMATION: (amount: number, method: string, account: string) => `✅ Pul yechish so'rovi qabul qilindi!

💸 Summa: ${formatSum(amount)} so'm
💳 Usul: ${method}
📝 Hisob: ${account}
⏳ Holat: Kutilmoqda (Admin tasdiqlashi bilan to'lab beriladi)

Tez orada hisobingizga tushadi!`,

  MUST_SUBSCRIBE: `⚠️ Botdan to'liq foydalanish uchun quyidagi homiy kanallarga a'zo bo'ling:`,
};

export const BOT_BUTTONS = {
  VOTE: '🗳 Ovoz berish',
  BALANCE: '💰 Balans',
  WITHDRAW: '📩 Pulni yechib olish',
  REFERRAL: '🔗 Referal ssilka',
  ADMIN_PANEL: '👑 Admin panel',
  CANCEL: '❌ Bekor qilish',
};
