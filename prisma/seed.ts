import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ADMIN_TELEGRAM_IDS = [
  { telegramId: '8140304652', username: 'Elbek_Muxtorovv', firstName: 'Elbek', phone: '998943489900' },
  { telegramId: '2053690211', username: 'MrDeveloper2827', firstName: 'Xurshid Ismoilov', phone: '998950642827' },
  { telegramId: '5957905121', username: 'JONIBEKISMOILOV', firstName: 'Manager (Jonibek)', phone: '998990652651' },
];

async function main() {
  console.log('🌱 Starting Open Budget Database Seeder...');

  // 1. Ensure Bot Instance exists
  let defaultBot = await prisma.botInstance.findFirst({
    where: { token: '8973530886:AAFjlBqhJgVaKseHVs1Eved6_ARENGeCAoc' },
  });

  if (!defaultBot) {
    defaultBot = await prisma.botInstance.create({
      data: {
        name: 'Navbahor MFY Boti',
        token: '8973530886:AAFjlBqhJgVaKseHVs1Eved6_ARENGeCAoc',
        botUsername: 'openbudjet_ishonch_2026_bot',
        mahallaId: '055495798013',
        mahallaName: 'Navbahor MFY',
        openBudgetUrl: 'https://openbudget.uz/boards/initiatives/initiative/53/7710ad19-6734-4df9-ab25-a5d2de6facbf',
        boardId: '53',
        initiativeUuid: '7710ad19-6734-4df9-ab25-a5d2de6facbf',
        targetVotes: 5000,
        currentVotes: 0,
        voteReward: 30000,
        refBonus: 5000,
        status: 'ONLINE',
      },
    });
    console.log('✅ Default bot created:', defaultBot.name);
  }

  // 2. Set Admin role for all 3 users
  for (const admin of ADMIN_TELEGRAM_IDS) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { telegramId: admin.telegramId },
          { username: admin.username },
          ...(admin.phone ? [{ phone: admin.phone }] : []),
        ],
      },
    });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: 'ADMIN',
          telegramId: admin.telegramId,
          username: admin.username,
          firstName: admin.firstName,
          phone: admin.phone || existing.phone,
        },
      });
      console.log(`👑 User #${existing.id} (${admin.firstName} - @${admin.username}) updated to ADMIN`);
    } else {
      const refCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const newUser = await prisma.user.create({
        data: {
          telegramId: admin.telegramId,
          username: admin.username,
          firstName: admin.firstName,
          phone: admin.phone,
          role: 'ADMIN',
          referralCode: refCode,
          botInstanceId: defaultBot.id,
        },
      });
      console.log(`👑 User #${newUser.id} (${admin.firstName}) created as ADMIN`);
    }
  }

  // 3. Clear all test votes and withdrawals
  const deletedVotes = await prisma.vote.deleteMany({});
  console.log(`🧹 Deleted all ${deletedVotes.count} test votes.`);

  const deletedWithdrawals = await prisma.withdrawal.deleteMany({});
  console.log(`🧹 Deleted all ${deletedWithdrawals.count} test withdrawals.`);

  // Reset all users' balance, steps, and vote counts to 0
  const resetUsers = await prisma.user.updateMany({
    data: {
      balance: 0,
      totalVotes: 0,
      totalEarned: 0,
      totalWithdrawn: 0,
      step: null,
      tempData: null,
    },
  });
  console.log(`✨ Reset balance, votes, and active steps for all ${resetUsers.count} users.`);

  // Reset all bots currentVotes count to 0
  await prisma.botInstance.updateMany({
    data: { currentVotes: 0 },
  });
  console.log(`🏁 All bots reset to 0 votes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
