import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 [Database] Baza tozalanmoqda...');

  // 1. Tozalash (Test ma'lumotlarini o'chirish)
  await prisma.referralReward.deleteMany({});
  await prisma.withdrawal.deleteMany({});
  await prisma.vote.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.botInstance.deleteMany({});

  console.log('✅ Barcha test ovozlar, pul yechish arizalari va foydalanuvchilar tozalandi!');

  // 2. Birlamchi toza bot va sozlamalarni tiklash
  const defaultToken = process.env.BOT_TOKEN || '8973530886:AAFjlBqhJgVaKseHVs1Eved6_ARENGeCAoc';
  const defaultUrl = 'https://openbudget.uz/boards/initiatives/initiative/53/7710ad19-6734-4df9-ab25-a5d2de6facbf';

  const defaultBot = await prisma.botInstance.create({
    data: {
      name: 'Navbahor MFY Boti (Asosiy)',
      token: defaultToken,
      botUsername: 'openbudjet_ishonch_2026_bot',
      mahallaId: '055495798013',
      mahallaName: 'Navbahor MFY',
      openBudgetUrl: defaultUrl,
      boardId: '53',
      initiativeUuid: '7710ad19-6734-4df9-ab25-a5d2de6facbf',
      targetVotes: 5000,
      currentVotes: 0,
      voteReward: 30000,
      refBonus: 5000,
      isActive: true,
      status: 'ONLINE',
    },
  });

  console.log(`🤖 Birlamchi toza bot yaratildi: #${defaultBot.id} @${defaultBot.botUsername}`);
}

main()
  .catch((e) => {
    console.error('Baza tozalashda xatolik:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
