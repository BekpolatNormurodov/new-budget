import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import sharp from 'sharp';
import { createWorker, Worker } from 'tesseract.js';
import * as fs from 'fs';
import * as path from 'path';

export interface CaptchaSolveResult {
  success: boolean;
  answer?: number;
  expression?: string;
  rawText?: string;
  error?: string;
}

@Injectable()
export class CaptchaSolverService implements OnModuleDestroy {
  private readonly logger = new Logger(CaptchaSolverService.name);
  private workerInstance: Worker | null = null;
  private isInitializing = false;

  async getWorker(): Promise<Worker> {
    if (this.workerInstance) return this.workerInstance;

    if (this.isInitializing) {
      // Wait for initialization to complete
      while (this.isInitializing) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (this.workerInstance) return this.workerInstance;
    }

    this.isInitializing = true;
    try {
      const bestLangPath = path.resolve(__dirname, '../../node_modules/@tesseract.js-data/eng/4.0.0_best_int');
      const fallbackLangPath = path.resolve(__dirname, '../../node_modules/@tesseract.js-data/eng/4.0.0');
      const localData = fs.existsSync(bestLangPath) ? bestLangPath : (fs.existsSync(fallbackLangPath) ? fallbackLangPath : undefined);

      const worker = await createWorker('eng', 1, {
        langPath: localData,
        gzip: false,
      });

      await worker.setParameters({
        tessedit_char_whitelist: '0123456789+-*/=xXlIoO| ',
        tessedit_pageseg_mode: '7' as any,
      });

      this.workerInstance = worker;
      this.logger.log('✅ Tesseract OCR Worker initialized successfully');
      return worker;
    } catch (err) {
      this.logger.error('Failed to initialize Tesseract Worker', err);
      throw err;
    } finally {
      this.isInitializing = false;
    }
  }

  async cleanCaptcha(inputBuffer: Buffer, threshold = 115): Promise<Buffer> {
    const { data, info } = await sharp(inputBuffer, { failOn: 'none' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height } = info;
    const gray: number[][] = [];
    for (let y = 0; y < height; y++) {
      const row: number[] = [];
      for (let x = 0; x < width; x++) {
        row.push(data[y * width + x] > threshold ? 255 : 0);
      }
      gray.push(row);
    }

    const visited = Array.from({ length: height }, () => Array(width).fill(false));
    const queue: [number, number][] = [];

    for (let x = 0; x < width; x++) {
      if (gray[0][x] === 255) { queue.push([0, x]); visited[0][x] = true; }
      if (gray[height - 1][x] === 255) { queue.push([height - 1, x]); visited[height - 1][x] = true; }
    }
    for (let y = 0; y < height; y++) {
      if (gray[y][0] === 255 && !visited[y][0]) { queue.push([y, 0]); visited[y][0] = true; }
      if (gray[y][width - 1] === 255 && !visited[y][width - 1]) { queue.push([y, width - 1]); visited[y][width - 1] = true; }
    }

    while (queue.length > 0) {
      const [cy, cx] = queue.shift()!;
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

    // Enhance minus/math signs
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

  evaluateExpression(text: string): { expression: string; num1: number; operator: string; num2: number; answer: number } | null {
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
        return this.calc(n1, op, n2);
      }
    }

    const digits = cleaned.split(/\s+/).filter(Boolean).map((s) => s.replace(/[^0-9]/g, '')).filter(Boolean);
    if (digits.length >= 3) {
      const n1 = parseInt(digits[0], 10);
      const n2 = parseInt(digits.slice(2).join(''), 10);
      if (!isNaN(n1) && !isNaN(n2)) return this.calc(n1, '+', n2);
    }
    return null;
  }

  private calc(n1: number, op: string, n2: number) {
    let ans = 0;
    if (op === '+') ans = n1 + n2;
    else if (op === '-') ans = n1 - n2;
    else if (op === '*') ans = n1 * n2;
    else if (op === '/') ans = n2 !== 0 ? Math.floor(n1 / n2) : 0;
    return { expression: `${n1} ${op} ${n2} =`, num1: n1, operator: op, num2: n2, answer: ans };
  }

  async solve(imageInput: string | Buffer): Promise<CaptchaSolveResult> {
    let buffer: Buffer;

    if (typeof imageInput === 'string') {
      if (imageInput.startsWith('data:image') || /^[A-Za-z0-9+/=]{50,}/.test(imageInput)) {
        const clean = imageInput.replace(/^data:image\/\w+;base64,/, '');
        buffer = Buffer.from(clean, 'base64');
      } else {
        buffer = fs.readFileSync(path.resolve(imageInput));
      }
    } else if (Buffer.isBuffer(imageInput)) {
      buffer = imageInput;
    } else {
      return { success: false, error: 'Noto\'g\'ri rasm formati.' };
    }

    try {
      const worker = await this.getWorker();
      const thresholds = [115, 100, 130, 145];
      const allTexts: string[] = [];

      for (const th of thresholds) {
        try {
          const candidate = await this.cleanCaptcha(buffer, th);
          const { data: { text } } = await worker.recognize(candidate);
          const raw = (text || '').trim();
          allTexts.push(raw);
          const res = this.evaluateExpression(raw);
          if (res) {
            return {
              success: true,
              answer: res.answer,
              expression: res.expression,
              rawText: raw,
            };
          }
        } catch (e) {
          // Continue with next threshold
        }
      }

      return {
        success: false,
        rawText: allTexts.join(' | '),
        error: 'Captcha ifodasini aniqlab bo\'lmadi',
      };
    } catch (err: any) {
      this.logger.error('Captcha solver error', err);
      return { success: false, error: err.message || 'Captcha OCR xatoligi' };
    }
  }

  async onModuleDestroy() {
    if (this.workerInstance) {
      await this.workerInstance.terminate();
      this.workerInstance = null;
    }
  }
}
