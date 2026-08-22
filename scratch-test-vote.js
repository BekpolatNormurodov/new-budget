const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { execSync } = require('child_process');

async function testVoteEndpoints() {
  const user = await prisma.user.findUnique({ where: { telegramId: '2053690211' } });
  const token = user.openBudgetJwt.replace(/^bearer\s+/i, '').trim();
  const proxy = 'http://ymkzqliy-uz-city_tashkent-rotate:mkkwlp9k8307@p.webshare.io:80';
  const uuid = 'f8df53fb-e437-4b80-a8e9-9c969c3c07aa';

  console.log('User:', user.firstName, user.phone);
  console.log('Initiative UUID:', uuid);

  const testUrls = [
    { method: 'POST', url: 'https://openbudget.uz/api/v1/initiatives/' + uuid + '/vote' },
    { method: 'POST', url: 'https://openbudget.uz/api/v1/initiatives/vote', data: JSON.stringify({ initiative_id: uuid }) },
    { method: 'POST', url: 'https://openbudget.uz/api/v1/votes', data: JSON.stringify({ initiative_id: uuid }) },
    { method: 'POST', url: 'https://openbudget.uz/api/v2/vote', data: JSON.stringify({ initiative_id: uuid }) },
    { method: 'GET', url: 'https://openbudget.uz/api/v1/users/initiatives' }
  ];

  for (const t of testUrls) {
    try {
      const dataFlag = t.data ? ' -d \'' + t.data + '\' -H "Content-Type: application/json"' : '';
      const cmd = 'curl -s -x ' + proxy + ' -X ' + t.method + ' -H "Authorization: ' + token + '" -H "hl: uz" -H "User-Agent: Mozilla/5.0"' + dataFlag + ' "' + t.url + '"';
      const res = execSync(cmd);
      console.log('\n[' + t.method + '] URL: ' + t.url);
      console.log('Result:', res.toString());
    } catch (e) {
      console.error('Error for ' + t.url + ':', e.message);
    }
  }
}

testVoteEndpoints().then(() => process.exit(0)).catch(console.error);
