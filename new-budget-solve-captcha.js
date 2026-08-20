/**
 * ============================================================================
 *  MATH CAPTCHA SOLVER (new-budget-solve-captcha.js)
 *  Siyoh dog'li matematik captchalarni o'qib, yechib, rasmini saqlaydi.
 * ============================================================================
 */

import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let workerInstance = null;

export async function getOCRWorker() {
  if (workerInstance) return workerInstance;
  const langPath = path.resolve(__dirname, './node_modules/@tesseract.js-data/eng/4.0.0_best_int');
  const worker = await createWorker('eng', 1, {
    langPath: fs.existsSync(langPath) ? langPath : undefined,
    gzip: false,
  });
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789+-*/=xXlIoO| ',
    tessedit_pageseg_mode: '7',
  });
  workerInstance = worker;
  return worker;
}

/**
 * Flood-fill orqali qora dog'lar ichidagi oq belgilarni tozalaydi
 */
export async function cleanCaptcha(inputBuffer, threshold = 115) {
  const { data, info } = await sharp(inputBuffer, { failOn: 'none' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const gray = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push(data[y * width + x] > threshold ? 255 : 0);
    }
    gray.push(row);
  }

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
      const ny = cy + dy, nx = cx + dx;
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

  // Minus chizig'ini qalinlashtirish
  const enhanced = Buffer.from(clean);
  for (let y = 5; y < height - 5; y++) {
    for (let x = 5; x < width - 15; x++) {
      let isHLine = true;
      for (let dx = 0; dx < 6; dx++) {
        if (clean[y * width + (x + dx)] !== 0) isHLine = false;
      }
      if (isHLine && clean[(y - 3) * width + x] === 255 && clean[(y + 3) * width + x] === 255) {
        for (let dy = -1; dy <= 2; dy++) {
          for (let dx = 0; dx < 8; dx++) {
            if (x + dx < width && y + dy >= 0 && y + dy < height) {
              enhanced[(y + dy) * width + (x + dx)] = 0;
            }
          }
        }
      }
    }
  }

  return sharp(enhanced, { raw: { width, height, channels: 1 } })
    .resize(width * 4, height * 4, { kernel: 'lanczos3' })
    .extend({ top: 25, bottom: 25, left: 25, right: 25, background: '#ffffff' })
    .withMetadata({ density: 300 })
    .png()
    .toBuffer();
}

/**
 * OCR matnidan matematik ifodani hisoblaydi
 */
export function evaluateExpression(text) {
  if (!text) return null;
  const cleaned = text
    .replace(/[lI|]/g, '1')
    .replace(/[oO]/g, '0')
    .replace(/[xX]/g, '*')
    .replace(/:/g, '/')
    .replace(/—|–/g, '-')
    .replace(/[^0-9\+\-\*\/\= ]/g, '')
    .trim();

  const opMatch = cleaned.match(/([\+\-\*\/])/);
  if (opMatch) {
    const op = opMatch[1];
    const idx = cleaned.indexOf(op);
    const n1 = parseInt(cleaned.slice(0, idx).replace(/[^0-9]/g, ''), 10);
    const n2 = parseInt(cleaned.slice(idx + 1).replace(/[=]/g, '').replace(/[^0-9]/g, ''), 10);
    if (!isNaN(n1) && !isNaN(n2)) {
      return calc(n1, op, n2);
    }
  }

  const digits = cleaned.split(/\s+/).filter(Boolean).map(s => s.replace(/[^0-9]/g, '')).filter(Boolean);
  if (digits.length >= 3) {
    const n1 = parseInt(digits[0], 10);
    const n2 = parseInt(digits.slice(2).join(''), 10);
    if (!isNaN(n1) && !isNaN(n2)) return calc(n1, '+', n2);
  }
  return null;
}

function calc(n1, op, n2) {
  let ans = 0;
  if (op === '+') ans = n1 + n2;
  else if (op === '-') ans = n1 - n2;
  else if (op === '*') ans = n1 * n2;
  else if (op === '/') ans = n2 !== 0 ? Math.floor(n1 / n2) : 0;
  return { expression: `${n1} ${op} ${n2} =`, num1: n1, operator: op, num2: n2, answer: ans };
}

/**
 * Captchani yechadi va rasmini yoniga saqlaydi
 *
 * @param {string|Buffer} imageInput - Fayl yo'li, Buffer yoki Base64
 * @param {object} [options]
 * @param {boolean} [options.saveImage=true] - Rasmlarni diskka saqlash
 * @param {string} [options.saveDir] - Saqlanadigan maxsus papka
 */
export async function solveCaptcha(imageInput, options = {}) {
  const saveImage = options.saveImage !== false;
  let buffer;
  let sourceFilePath = null;

  if (typeof imageInput === 'string') {
    if (imageInput.startsWith('data:image') || /^[A-Za-z0-9+/=]{50,}/.test(imageInput)) {
      const clean = imageInput.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(clean, 'base64');
    } else {
      sourceFilePath = path.resolve(imageInput);
      buffer = fs.readFileSync(sourceFilePath);
    }
  } else if (Buffer.isBuffer(imageInput)) {
    buffer = imageInput;
  } else {
    throw new Error('Unsupported image format.');
  }

  const worker = await getOCRWorker();
  const thresholds = [115, 100, 130, 145];

  let best = null;
  let cleanedBuffer = null;
  let allTexts = [];

  for (const th of thresholds) {
    try {
      const candidate = await cleanCaptcha(buffer, th);
      const { data: { text } } = await worker.recognize(candidate);
      const raw = (text || '').trim();
      allTexts.push(raw);
      const res = evaluateExpression(raw);
      if (res) {
        best = { ...res, rawText: raw };
        cleanedBuffer = candidate;
        break;
      }
    } catch (e) {}
  }

  if (!best) {
    return { success: false, rawText: allTexts.join(' | '), error: 'Could not solve captcha expression' };
  }

  let savedOriginalPath = null;
  let savedCleanedPath = null;

  // Rasmlarni yoniga saqlash
  if (saveImage) {
    const timestamp = Date.now();
    let targetDir = options.saveDir;
    let baseName = '';

    if (sourceFilePath) {
      targetDir = targetDir || path.dirname(sourceFilePath);
      const ext = path.extname(sourceFilePath);
      baseName = path.basename(sourceFilePath, ext);
      savedOriginalPath = sourceFilePath;
    } else {
      targetDir = targetDir || path.join(__dirname, 'saved_captchas');
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      baseName = `captcha_${timestamp}_ans_${best.answer}`;
      savedOriginalPath = path.join(targetDir, `${baseName}_orig.png`);
      fs.writeFileSync(savedOriginalPath, buffer);
    }

    if (cleanedBuffer) {
      savedCleanedPath = path.join(targetDir, `${baseName}_cleaned.png`);
      fs.writeFileSync(savedCleanedPath, cleanedBuffer);
    }
  }

  return {
    success: true,
    answer: best.answer,
    expression: best.expression,
    rawText: best.rawText,
    savedOriginalPath,
    savedCleanedPath,
    details: best,
  };
}

export async function terminateWorker() {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
  }
}

// CLI Execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.argv[2] || path.join(__dirname, 'samples/captcha.png');
  console.log(`🚀 Solving: ${target}`);
  try {
    const res = await solveCaptcha(target, { saveImage: true });
    if (res.success) {
      console.log(`✅ Ifoda: ${res.expression}  Javob: ${res.answer}`);
      if (res.savedCleanedPath) console.log(`💾 Cleaned rasm saqlandi: ${res.savedCleanedPath}`);
    } else {
      console.log(`❌ Xatolik:`, res.error);
    }
  } catch (err) {
    console.error(err.message);
  } finally {
    await terminateWorker();
  }
}
