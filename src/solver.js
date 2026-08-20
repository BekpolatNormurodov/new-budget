import { createWorker } from 'tesseract.js';
import { preprocessCaptcha, base64ToBuffer } from './preprocessor.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedWorker = null;

/**
 * Initializes and returns a cached Tesseract OCR worker configured for math symbols.
 */
export async function getOCRWorker() {
  if (cachedWorker) {
    return cachedWorker;
  }

  // Use local traineddata from @tesseract.js-data/eng
  const localLangPath = path.resolve(__dirname, '../node_modules/@tesseract.js-data/eng/4.0.0_best_int');
  const fallbackLangPath = path.resolve(__dirname, '../node_modules/@tesseract.js-data/eng/4.0.0');
  const langPath = fs.existsSync(localLangPath) ? localLangPath : fallbackLangPath;

  const worker = await createWorker('eng', 1, {
    langPath: fs.existsSync(langPath) ? langPath : undefined,
    gzip: false,
  });

  await worker.setParameters({
    tessedit_char_whitelist: '0123456789+-*/=xXlIoO| ',
    tessedit_pageseg_mode: '7', // Treat as a single line of text
  });

  cachedWorker = worker;
  return worker;
}

/**
 * Normalizes common OCR confusion for math characters and evaluates the expression.
 * @param {string} text 
 * @returns {{ expression: string, num1: number, operator: string, num2: number, answer: number } | null}
 */
export function parseAndEvaluate(text) {
  if (!text) return null;

  // Clean and normalize character confusions
  let cleaned = text
    .replace(/[lI|]/g, '1')
    .replace(/[oO]/g, '0')
    .replace(/[xX]/g, '*')
    .replace(/:/g, '/')
    .replace(/—|–/g, '-')
    .replace(/[^0-9\+\-\*\/\= ]/g, '')
    .trim();

  // Find operator (+, -, *, /)
  const opMatch = cleaned.match(/([\+\-\*\/])/);
  if (opMatch) {
    const op = opMatch[1];
    const opIndex = cleaned.indexOf(op);

    const leftPart = cleaned.slice(0, opIndex).replace(/[^0-9]/g, '');
    const rightPart = cleaned.slice(opIndex + 1).replace(/[=]/g, '').replace(/[^0-9]/g, '');

    if (leftPart && rightPart) {
      const num1 = parseInt(leftPart, 10);
      const num2 = parseInt(rightPart, 10);

      if (!isNaN(num1) && !isNaN(num2)) {
        return calculate(num1, op, num2);
      }
    }
  }

  // Fallback: if no operator was matched, but we have 3 digit tokens (e.g. "9 1 13" -> 9 + 13 or similar)
  const digits = cleaned.split(/\s+/).filter(Boolean).map(s => s.replace(/[^0-9]/g, '')).filter(Boolean);
  if (digits.length >= 3) {
    const num1 = parseInt(digits[0], 10);
    const num2 = parseInt(digits.slice(2).join(''), 10);
    if (!isNaN(num1) && !isNaN(num2)) {
      return calculate(num1, '+', num2);
    }
  }

  return null;
}

function calculate(num1, op, num2) {
  let answer = 0;
  switch (op) {
    case '+':
      answer = num1 + num2;
      break;
    case '-':
      answer = num1 - num2;
      break;
    case '*':
      answer = num1 * num2;
      break;
    case '/':
      answer = num2 !== 0 ? Math.floor(num1 / num2) : 0;
      break;
    default:
      return null;
  }
  return {
    expression: `${num1} ${op} ${num2} =`,
    num1,
    operator: op,
    num2,
    answer,
  };
}

/**
 * Solves a math captcha image.
 * 
 * @param {string|Buffer} imageInput - File path, base64 data URI, or Buffer
 * @returns {Promise<{ success: boolean, answer?: number, expression?: string, rawText?: string, error?: string }>}
 */
export async function solveCaptcha(imageInput) {
  let buffer;
  if (typeof imageInput === 'string') {
    if (imageInput.startsWith('data:image') || /^[A-Za-z0-9+/=]{50,}/.test(imageInput)) {
      buffer = base64ToBuffer(imageInput);
    } else {
      buffer = fs.readFileSync(imageInput);
    }
  } else if (Buffer.isBuffer(imageInput)) {
    buffer = imageInput;
  } else {
    throw new Error('Unsupported image input format. Expected Buffer, file path, or base64 string.');
  }

  const worker = await getOCRWorker();
  const candidates = await preprocessCaptcha(buffer);

  let bestResult = null;
  let allRawTexts = [];

  for (const imgBuffer of candidates) {
    const { data: { text } } = await worker.recognize(imgBuffer);
    const rawText = (text || '').trim();
    allRawTexts.push(rawText);
    const parsed = parseAndEvaluate(rawText);

    if (parsed) {
      bestResult = {
        success: true,
        answer: parsed.answer,
        expression: parsed.expression,
        rawText,
        details: parsed,
      };
      break;
    }
  }

  if (bestResult) {
    return bestResult;
  }

  return {
    success: false,
    rawText: allRawTexts.join(' | '),
    error: `Could not parse mathematical expression from OCR candidates: ${allRawTexts.join(', ')}`,
  };
}

/**
 * Cleanly terminates the OCR worker when application exits.
 */
export async function terminateWorker() {
  if (cachedWorker) {
    await cachedWorker.terminate();
    cachedWorker = null;
  }
}
