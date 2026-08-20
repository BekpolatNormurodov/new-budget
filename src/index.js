import { solveCaptcha, terminateWorker } from './solver.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('🚀 Math Captcha Solver ishga tushmoqda...\n');

  const samplePath = path.join(__dirname, '../samples/captcha.png');

  if (!fs.existsSync(samplePath)) {
    console.error(`❌ Namuna rasm topilmadi: ${samplePath}`);
    return;
  }

  console.log(`📁 Test qilinayotgan rasm: ${samplePath}`);
  console.time('⏳ Yechish vaqti');

  try {
    const result = await solveCaptcha(samplePath);
    console.timeEnd('⏳ Yechish vaqti');

    console.log('\n--- Natijalar ---');
    if (result.success) {
      console.log(`✅ Aniqlangan matn (OCR): "${result.rawText}"`);
      console.log(`🧮 Matematik ifoda: ${result.expression}`);
      console.log(`🎯 CAPTCHA JAVOBI: ${result.answer}`);
    } else {
      console.log(`❌ Yechib bo'lmadi.`);
      console.log(`Raw OCR: "${result.rawText}"`);
      console.log(`Xatolik: ${result.error}`);
    }
  } catch (err) {
    console.error('Xatolik yuz berdi:', err);
  } finally {
    await terminateWorker();
    console.log('\n✨ Tugallandi.');
  }
}

main();
