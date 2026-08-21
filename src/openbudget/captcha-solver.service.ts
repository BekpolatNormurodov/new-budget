import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import sharp from 'sharp';
import { createWorker, Worker } from 'tesseract.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CaptchaSolveResult {
  success: boolean;
  answer?: number | string;
  expression?: string;
  rawText?: string;
  error?: string;
}

@Injectable()
export class CaptchaSolverService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CaptchaSolverService.name);
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private waitQueue: Array<(worker: Worker) => void> = [];
  private isInitialized = false;
  private isInitializing = false;
  private poolSize = 4;

  async onModuleInit() {
    const cpuCount = os.cpus()?.length || 2;
    // 6 ta CPU Core va 16GB RAM imkoniyatidan 100% to'liq foydalanish uchun poolSize ni 6 tagacha chiqaramiz
    this.poolSize = Math.max(4, Math.min(8, cpuCount));
    this.logger.log(`⚡ Initializing Tesseract OCR Multi-Worker Pool (${this.poolSize} parallel workers across ${cpuCount} CPU cores)...`);

    setTimeout(() => {
      this.initWorkerPool().catch((err) => {
        this.logger.warn(`Tesseract OCR worker pool background init warning: ${err.message}`);
      });
    }, 1000);
  }

  private async createSingleWorker(): Promise<Worker> {
    const worker = await createWorker('eng');

    await worker.setParameters({
      tessedit_char_whitelist: '0123456789+-*',
      tessedit_pageseg_mode: '10' as any,
      user_defined_dpi: '300' as any,
    });

    return worker;
  }

  private async initWorkerPool() {
    if (this.isInitializing || this.isInitialized) return;
    this.isInitializing = true;

    try {
      const promises: Promise<Worker>[] = [];
      for (let i = 0; i < this.poolSize; i++) {
        promises.push(this.createSingleWorker());
      }

      const initializedWorkers = await Promise.all(promises);
      this.workers = initializedWorkers;
      this.availableWorkers = [...initializedWorkers];
      this.isInitialized = true;
      this.logger.log(`✅ Tesseract OCR Multi-Worker Pool ready with ${this.workers.length} active workers in RAM!`);
    } catch (err: any) {
      this.logger.warn(`Full Tesseract Pool initialization fallback: ${err.message}`);
      try {
        const fallback = await this.createSingleWorker();
        this.workers = [fallback];
        this.availableWorkers = [fallback];
        this.isInitialized = true;
        this.logger.log('✅ Fallback single worker initialized');
      } catch (e2: any) {
        this.logger.warn(`Single fallback worker creation deferred: ${e2.message}`);
      }
    } finally {
      this.isInitializing = false;
    }
  }

  async acquireWorker(): Promise<Worker> {
    if (!this.isInitialized || this.workers.length === 0) {
      await this.initWorkerPool();
    }

    if (this.availableWorkers.length > 0) {
      return this.availableWorkers.pop()!;
    }

    return new Promise<Worker>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  async getWorker(): Promise<Worker> {
    return this.acquireWorker();
  }

  releaseWorker(worker: Worker) {
    if (this.waitQueue.length > 0) {
      const nextResolver = this.waitQueue.shift()!;
      nextResolver(worker);
    } else {
      this.availableWorkers.push(worker);
    }
  }

  /**
   * 100% Aniq Doiraviy Island & Belgilar Segmentatsiyasi (300 DPI)
   */
  async solveFullCaptchaWithWorker(rawBuffer: Buffer, worker: Worker): Promise<{ expression: string; ans: number } | null> {
    try {
      const { data, info } = await sharp(rawBuffer, { failOn: 'none' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { width, height } = info;

      // 1. Tashqi oq fonni flood fill bilan belgilash
      const bg = Array.from({ length: height }, () => Array(width).fill(false));
      const q: [number, number][] = [];
      for (let x = 0; x < width; x++) {
        if (data[x] > 180) { q.push([0, x]); bg[0][x] = true; }
        if (data[(height - 1) * width + x] > 180) { q.push([height - 1, x]); bg[height - 1][x] = true; }
      }
      for (let y = 0; y < height; y++) {
        if (data[y * width] > 180 && !bg[y][0]) { q.push([y, 0]); bg[y][0] = true; }
        if (data[y * width + width - 1] > 180 && !bg[y][width - 1]) { q.push([y, width - 1]); bg[y][width - 1] = true; }
      }

      while (q.length > 0) {
        const [cy, cx] = q.shift()!;
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
      const colCounts: number[] = [];
      for (let x = 0; x < width; x++) {
        let count = 0;
        for (let y = 0; y < height; y++) {
          if (digitCanvas[y * width + x] === 0) count++;
        }
        colCounts.push(count);
      }

      const chars: Array<{ start: number; end: number }> = [];
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

      const results: string[] = [];
      for (let i = 0; i < chars.length; i++) {
        const c = chars[i];
        const cw = c.end - c.start;
        if (cw < 2) continue;

        const charImg = await sharp(digitPng)
          .extract({ left: c.start, top: 0, width: cw, height })
          .extend({ top: 20, bottom: 20, left: 20, right: 20, background: { r: 255, g: 255, b: 255 } })
          .resize(100, 100, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
          .withMetadata({ density: 300 })
          .png()
          .toBuffer();

        const res = await worker.recognize(charImg);
        const txt = res.data.text.trim().replace(/[^0-9\+\-\*]/g, '');
        if (txt) results.push(txt);
      }

      const expr = results.join(' ');
      const cleanExpr = results.join('');

      let op = null;
      let opIdx = -1;
      for (let i = 0; i < results.length; i++) {
        if (results[i] === '+' || results[i] === '-' || results[i] === '*') {
          op = results[i];
          opIdx = i;
          break;
        }
      }

      if (op && opIdx > 0 && opIdx < results.length - 1) {
        const n1 = parseInt(results.slice(0, opIdx).join(''), 10);
        const n2 = parseInt(results.slice(opIdx + 1).join(''), 10);
        if (!isNaN(n1) && !isNaN(n2)) {
          let ans = 0;
          if (op === '+') ans = n1 + n2;
          if (op === '-') ans = n1 - n2;
          if (op === '*') ans = n1 * n2;
          return { expression: `${n1} ${op} ${n2}`, ans };
        }
      }

      const m = cleanExpr.match(/^(\d+)([\+\-\*])(\d+)$/);
      if (m) {
        const n1 = parseInt(m[1], 10);
        const opStr = m[2];
        const n2 = parseInt(m[3], 10);
        let ans = 0;
        if (opStr === '+') ans = n1 + n2;
        if (opStr === '-') ans = n1 - n2;
        if (opStr === '*') ans = n1 * n2;
        return { expression: `${n1} ${opStr} ${n2}`, ans };
      }

      return null;
    } catch (err: any) {
      return null;
    }
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

    const worker = await this.acquireWorker();
    try {
      const parsed = await this.solveFullCaptchaWithWorker(buffer, worker);
      if (parsed) {
        return {
          success: true,
          answer: parsed.ans,
          expression: parsed.expression,
        };
      }
      return {
        success: false,
        error: 'Captcha ifodasi ajratib olinmadi',
      };
    } catch (err: any) {
      this.logger.error('Captcha solver error', err);
      return { success: false, error: err.message || 'Captcha OCR xatoligi' };
    } finally {
      this.releaseWorker(worker);
    }
  }

  async onModuleDestroy() {
    this.logger.log('🛑 Terminating Tesseract OCR Multi-Worker Pool...');
    await Promise.all(this.workers.map((w) => w.terminate().catch(() => {})));
    this.workers = [];
    this.availableWorkers = [];
  }
}
