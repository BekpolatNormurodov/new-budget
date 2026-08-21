const axios = require('axios');
const sharp = require('sharp');
const { createWorker } = require('tesseract.js');

async function cleanAndEnhanceImage(inputBuffer) {
  // 1. Convert to PNG using sharp with failOn: 'none'
  const { data, info } = await sharp(inputBuffer, { failOn: 'none' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const threshold = 115;
  const gray = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push(data[y * width + x] > threshold ? 255 : 0);
    }
    gray.push(row);
  }

  // Flood fill border removal
  const visited = Array.from({ length: height }, () => Array(width).fill(false));
  const queue = [];

  for (let x = 0; x < width; x++) {
    if (gray[0][x] === 255) { queue.push([0, x]); visited[0][x] = true; }
    if (gray[height - 1][x] === 255) { queue.push([height - 1, x]); visited[height - 1][x] = true; }
  }
  for (let y = 0; y < height; y++) {
    if (gray[y][0] === 255 && !visited[y][0]) { queue.push([y, 0]); visited[y][0] = true; }
    if (gray[y][width - 1] === 255 && !visited[y][width - 1]) { queue.push([y, width - 1]); visited[y][width - 1] = true; }
  }

  while (queue.length > 0) {
    const [cy, cx] = queue.shift();
    for (const [dy, dx] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const ny = cy + dy;
      const nx = cx + dx;
      if (ny >= 0 && ny < height && nx >= 0 && nx < width && !visited[ny][nx] && gray[ny][nx] === 255) {
        visited[ny][nx] = true;
        queue.push([ny, nx]);
      }
    }
  }

  const clean = Buffer.alloc(width * height, 255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((!visited[y][x] && gray[y][x] === 255) || (visited[y][x] && gray[y][x] === 0)) {
        clean[y * width + x] = 0;
      }
    }
  }

  // Lanczos upscale & threshold to crisp PNG
  return sharp(clean, { raw: { width, height, channels: 1 } })
    .resize(width * 4, height * 4, { kernel: 'lanczos3' })
    .threshold(128)
    .png()
    .toBuffer();
}

async function runTestFlow() {
  const phone = '998950642827';
  const mahallaId = '055495798013';
  const uuid = 'f8df53fb-e437-4b80-a8e9-9c969c3c07aa';

  console.log('=== 🚀 OCHIQ BUDJET VOTE & CAPTCHA TEST PIPELINE ===');
  console.log('📱 Telefon:', phone);
  console.log('📍 Mahalla ID:', mahallaId);
  console.log('🆔 UUID:', uuid);

  // 1. Fetch Captcha from new.openbudget.uz
  console.log('\n1. Captcha so\'ralmoqda (https://new.openbudget.uz/api/v2/vote/captcha-2)...');
  const startTime = Date.now();
  const captchaRes = await axios.get('https://new.openbudget.uz/api/v2/vote/captcha-2', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Referer': 'https://new.openbudget.uz/',
    },
    timeout: 8000,
  });

  const latency = Date.now() - startTime;
  console.log('✅ Captcha muvaffaqiyatli olindi! Latency:', latency + 'ms');
  console.log('🔑 captchaKey:', captchaRes.data.captchaKey);
  console.log('🖼 Image base64 uzunligi:', captchaRes.data.image?.length);

  // 2. Preprocess and Clean image with Sharp
  console.log('\n2. Rasm Sharp orqali shovqinlardan tozalanmoqda va PNG ga o\'girilmoqda...');
  const rawBuffer = Buffer.from(captchaRes.data.image, 'base64');
  const cleanPngBuffer = await cleanAndEnhanceImage(rawBuffer);
  console.log('✅ Rasm muvaffaqiyatli tozalandi (PNG buffer hajmi:', cleanPngBuffer.length, 'bayt)');

  // 3. Solve Captcha using Tesseract OCR
  console.log('\n3. Tesseract OCR orqali captcha yechilmoqda...');
  const ocrStart = Date.now();
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789+-*/=xXlIoO| ',
    tessedit_pageseg_mode: '7',
  });

  const ocrRes = await worker.recognize(cleanPngBuffer);
  await worker.terminate();

  const ocrLatency = Date.now() - ocrStart;
  console.log('✅ OCR yakunlandi! Latency:', ocrLatency + 'ms');
  const rawText = ocrRes.data.text.trim();
  console.log('📝 Xom matn (Raw OCR):', JSON.stringify(rawText));

  // Math solver (masalan: "12 + 5" yoki "34 - 9" yoki "15")
  let cleanText = rawText.replace(/[^0-9\+\-\*]/g, '');
  console.log('🧮 Tozalangan formula:', cleanText);

  let solvedAnswer = cleanText;
  if (cleanText.includes('+')) {
    const parts = cleanText.split('+');
    solvedAnswer = String(parseInt(parts[0], 10) + parseInt(parts[1], 10));
  } else if (cleanText.includes('-')) {
    const parts = cleanText.split('-');
    solvedAnswer = String(parseInt(parts[0], 10) - parseInt(parts[1], 10));
  }
  console.log('🎯 Yechilgan Yakuniy Javob (Captcha Result):', solvedAnswer);

  // 4. Test send OTP / SMS request endpoints
  console.log('\n4. SMS yuborish so\'rovi test qilinmoqda (Phone: ' + phone + ')...');
  const smsEndpoints = [
    {
      name: 'OpenBudget Login/OTP API',
      url: 'https://new.openbudget.uz/api/v1/login/send-otp',
      body: { phone_number: phone, captcha_key: captchaRes.data.captchaKey, captcha_result: solvedAnswer },
    },
    {
      name: 'OpenBudget Vote SMS API (V2)',
      url: 'https://new.openbudget.uz/api/v2/vote/send-sms',
      body: { phone: phone, initiative_id: uuid, captcha_key: captchaRes.data.captchaKey, captcha_result: solvedAnswer },
    },
    {
      name: 'OpenBudget Vote SMS API (V1)',
      url: 'https://new.openbudget.uz/api/v1/vote/send-sms',
      body: { phone: phone, initiative_id: uuid, captcha_key: captchaRes.data.captchaKey, captcha_result: solvedAnswer },
    },
  ];

  for (const ep of smsEndpoints) {
    try {
      const res = await axios.post(ep.url, ep.body, { validateStatus: () => true, timeout: 8000 });
      console.log(`\n🔹 [${ep.name}] POST ${ep.url}`);
      console.log('   HTTP Status:', res.status);
      console.log('   Javob:', JSON.stringify(res.data));
    } catch (e) {
      console.log(`\n❌ [${ep.name}] Ulanish xatosi:`, e.message);
    }
  }
}

runTestFlow().catch(console.error);
