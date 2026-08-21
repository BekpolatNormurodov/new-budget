const axios = require('axios');
const sharp = require('sharp');
const { createWorker } = require('tesseract.js');
const readline = require('readline');

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

// 100% Aniq Doiraviy Island & Harf Segmentatsiyasi (300 DPI)
async function solveFullCaptcha(rawBuffer, worker) {
  const { data, info } = await sharp(rawBuffer, { failOn: 'none' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  // 1. Tashqi fonni flood fill bilan belgilash
  const bg = Array.from({ length: height }, () => Array(width).fill(false));
  const q = [];
  for (let x = 0; x < width; x++) {
    if (data[x] > 180) { q.push([0, x]); bg[0][x] = true; }
    if (data[(height - 1) * width + x] > 180) { q.push([height - 1, x]); bg[height - 1][x] = true; }
  }
  for (let y = 0; y < height; y++) {
    if (data[y * width] > 180 && !bg[y][0]) { q.push([y, 0]); bg[y][0] = true; }
    if (data[y * width + width - 1] > 180 && !bg[y][width - 1]) { q.push([y, width - 1]); bg[y][width - 1] = true; }
  }

  while (q.length > 0) {
    const [cy, cx] = q.shift();
    for (const [dy, dx] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const ny = cy + dy;
      const nx = cx + dx;
      if (ny >= 0 && ny < height && nx >= 0 && nx < width && !bg[ny][nx] && data[ny * width + nx] > 160) {
        bg[ny][nx] = true;
        q.push([ny, nx]);
      }
    }
  }

  // 2. Doira ichidagi raqamlarni ajratib olish
  const digitCanvas = Buffer.alloc(width * height, 255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!bg[y][x] && data[y * width + x] > 160) {
        digitCanvas[y * width + x] = 0;
      }
    }
  }

  // 3. Har bir belgi ustunlarini topish
  const colCounts = [];
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y < height; y++) {
      if (digitCanvas[y * width + x] === 0) count++;
    }
    colCounts.push(count);
  }

  const chars = [];
  let inC = false;
  let st = 0;
  for (let x = 0; x < width; x++) {
    if (colCounts[x] > 0) {
      if (!inC) { inC = true; st = x; }
    } else {
      if (inC) {
        inC = false;
        if (x - st >= 2) chars.push({ start: st, end: x });
      }
    }
  }

  const digitPng = await sharp(digitCanvas, { raw: { width, height, channels: 1 } })
    .withMetadata({ density: 300 })
    .png()
    .toBuffer();

  const results = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const cw = c.end - c.start;
    if (cw < 2) continue;

    const charImg = await sharp(digitPng)
      .extract({ left: c.start, top: 0, width: cw, height: height })
      .extend({ top: 20, bottom: 20, left: 20, right: 20, background: { r: 255, g: 255, b: 255 } })
      .resize(100, 100, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
      .threshold(128)
      .withMetadata({ density: 300 })
      .png()
      .toBuffer();

    const ocr = await worker.recognize(charImg);
    const ch = ocr.data.text.trim().replace(/[^0-9\+\-\*\/]/g, '');
    if (ch) results.push(ch);
  }

  const formulaStr = results.join('');
  const match = formulaStr.match(/(\d{1,2})([\+\-\*\/])(\d{1,2})/);
  if (match) {
    const n1 = parseInt(match[1], 10);
    const op = match[2];
    const n2 = parseInt(match[3], 10);
    let ans = 0;
    if (op === '+') ans = n1 + n2;
    else if (op === '-') ans = n1 - n2;
    else if (op === '*') ans = n1 * n2;
    else if (op === '/') ans = n2 !== 0 ? Math.floor(n1 / n2) : 0;
    return { n1, op, n2, ans, expression: `${n1} ${op} ${n2}` };
  }

  return null;
}

async function main() {
  console.log('\n========================================================');
  console.log('🚀 OPENBUDGET LIVE AUTH & SMS OTP SINOV DASTURI');
  console.log('========================================================\n');

  let phoneArg = process.argv[2] || '998950642827';
  let cleanPhone = phoneArg.replace(/[^0-9]/g, '');
  if (cleanPhone.length === 9) cleanPhone = '998' + cleanPhone;
  const phone = cleanPhone;

  console.log(`📱 Telefon raqam: +${phone}`);
  console.log('⚙️  Tesseract OCR (300 DPI) yuklanmoqda...');

  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789+-*',
    tessedit_pageseg_mode: '10',
    user_defined_dpi: '300',
  });

  let otpKey = null;
  let sentSuccess = false;

  console.log('🔄 Captcha olinmoqda va aniq yechilmoqda...');

  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      const capRes = await axios.get('https://new.openbudget.uz/api/v2/vote/captcha-2', {
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/122.0.0.0 Safari/537.36' },
        timeout: 6000,
      });

      const key = capRes.data.captchaKey;
      const rawBuffer = Buffer.from(capRes.data.image, 'base64');
      const parsed = await solveFullCaptcha(rawBuffer, worker);

      if (parsed) {
        process.stdout.write(`\r[Urinish #${attempt}] "${parsed.expression}" -> Javob: ${parsed.ans} ... `);

        const otpRes = await axios.post('https://new.openbudget.uz/api/v1/login/send-otp', {
          phone_number: phone,
          captcha_key: key,
          captcha_result: parsed.ans,
        }, {
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 Chrome/122.0.0.0 Safari/537.36' },
          validateStatus: () => true,
          timeout: 8000,
        });

        if (otpRes.status === 200 && otpRes.data?.otpKey) {
          otpKey = otpRes.data.otpKey;
          sentSuccess = true;
          console.log('\n\n✅🎉 SMS KOD TELEFONINGIZGA MUVAFFAQIYATLI YUBORILDI!');
          console.log(`🔑 Sessiya kaliti (otpKey): ${otpKey}`);
          break;
        }
      }
    } catch (err) {
      // davom etish
    }
  }

  await worker.terminate();

  if (!sentSuccess || !otpKey) {
    console.log('\n❌ SMS yuborib bo\'lmadi. Qaytadan urinib ko\'ring.');
    process.exit(1);
  }

  const smsCode = await askQuestion('\n📩 Telefoningizga kelgan 6 xonali SMS kodni kiriting: ');

  if (!smsCode || smsCode.length < 4) {
    console.log('❌ SMS kod kiritilmadi!');
    process.exit(1);
  }

  console.log('\n⏳ Kod tasdiqlanmoqda...');

  try {
    const verifyRes = await axios.post('https://new.openbudget.uz/api/v1/login/verify-otp', {
      phone_number: phone,
      otp_key: otpKey,
      otp_code: smsCode.trim(),
    }, {
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 Chrome/122.0.0.0 Safari/537.36' },
      validateStatus: () => true,
      timeout: 8000,
    });

    if (verifyRes.status === 200 || verifyRes.data?.access_token || verifyRes.data?.token) {
      console.log('\n🎉🎉🎉 LOGIN 100% MUVAFFAQIYATLI YAKUNLANDI! 🎉🎉🎉\n');
      console.log('🔑 Tokenlar:', JSON.stringify(verifyRes.data, null, 2));

      const token = verifyRes.data.access_token || verifyRes.data.token;
      if (token) {
        console.log('\n👤 Shaxsiy profil ma\'lumotlari tekshirilmoqda...');
        const cleanToken = token.replace(/^bearer\s+/i, '').trim();
        const meRes = await axios.get('https://new.openbudget.uz/api/v1/users/me', {
          headers: {
            Authorization: cleanToken,
            hl: 'uz',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
          validateStatus: () => true,
          timeout: 8000,
        });
        console.log('📋 Profil Javobi:', JSON.stringify(meRes.data, null, 2));
      }
    } else {
      console.log('\n❌ Tasdiqlashda xatolik:', JSON.stringify(verifyRes.data, null, 2));
    }
  } catch (verifyErr) {
    console.log('\n❌ Ulanish xatosi:', verifyErr.message);
  }

  console.log('\n========================================================\n');
}

main().catch(console.error);
