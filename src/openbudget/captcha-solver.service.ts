import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as sharpImport from 'sharp';
const sharp = (sharpImport as any).default || sharpImport;
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
      tessedit_char_whitelist: '0123456789+-*lI|OQo',
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

      // 1. Tashqi oq fonni flood fill bilan belgilash (Threshold: 150)
      const bg = Array.from({ length: height }, () => Array(width).fill(false));
      const q: [number, number][] = [];
      for (let x = 0; x < width; x++) {
        if (data[x] > 150) { q.push([0, x]); bg[0][x] = true; }
        if (data[(height - 1) * width + x] > 150) { q.push([height - 1, x]); bg[height - 1][x] = true; }
      }
      for (let y = 0; y < height; y++) {
        if (data[y * width] > 150 && !bg[y][0]) { q.push([y, 0]); bg[y][0] = true; }
        if (data[y * width + width - 1] > 150 && !bg[y][width - 1]) { q.push([y, width - 1]); bg[y][width - 1] = true; }
      }

      while (q.length > 0) {
        const [cy, cx] = q.shift()!;
        for (const [dy, dx] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const ny = cy + dy;
          const nx = cx + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width && !bg[ny][nx] && data[ny * width + nx] > 150) {
            bg[ny][nx] = true;
            q.push([ny, nx]);
          }
        }
      }

      // 2. Faqat qora doiralar (bloblar)
      const isBlack = Array.from({ length: height }, () => Array(width).fill(false));
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!bg[y][x] && data[y * width + x] < 120) isBlack[y][x] = true;
        }
      }

      const visited = Array.from({ length: height }, () => Array(width).fill(false));
      const circles: Array<{ minX: number; maxX: number; minY: number; maxY: number; count: number }> = [];

      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          if (isBlack[y][x] && !visited[y][x]) {
            const qC: [number, number][] = [[y, x]];
            visited[y][x] = true;
            let minX = x, maxX = x, minY = y, maxY = y, count = 0;

            while (qC.length > 0) {
              const [cy, cx] = qC.shift()!;
              count++;
              if (cx < minX) minX = cx;
              if (cx > maxX) maxX = cx;
              if (cy < minY) minY = cy;
              if (cy > maxY) maxY = cy;

              for (const [dy, dx] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
                const ny = cy + dy;
                const nx = cx + dx;
                if (ny >= 0 && ny < height && nx >= 0 && nx < width && isBlack[ny][nx] && !visited[ny][nx]) {
                  visited[ny][nx] = true;
                  qC.push([ny, nx]);
                }
              }
            }

            if (count >= 25 && (maxX - minX + 1) >= 5) {
              circles.push({ minX, maxX, minY, maxY, count });
            }
          }
        }
      }

      circles.sort((a, b) => a.minX - b.minX);

      const results: string[] = [];
      for (let i = 0; i < circles.length; i++) {
        const c = circles[i];
        const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
        if (bw > bh * 1.5 || bh <= 12) {
          // Faqat o'rtada va yetarlicha keng chiziq bo'lsa minus deb olamiz
          if (bw >= 14 && bh >= 3 && i > 0 && i < circles.length - 1) {
            results.push('-');
          }
          continue;
        }

        const innerPoints: Array<{ y: number; x: number }> = [];

        for (let y = c.minY; y <= c.maxY; y++) {
          for (let x = c.minX; x <= c.maxX; x++) {
            if (!bg[y][x] && data[y * width + x] > 135) {
              innerPoints.push({ y, x });
            }
          }
        }

        if (innerPoints.length < 5) {
          if (bw >= 12 && bh >= 3 && bw > bh * 1.4 && results.length > 0 && i < circles.length - 1) {
            if (!results.some(r => r === '+' || r === '-' || r === '*')) {
              results.push('-');
            }
          }
          continue;
        }

        let minX = width, maxX = 0, minY = height, maxY = 0;
        for (const p of innerPoints) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }

        const cw = maxX - minX + 1;
        const ch = maxY - minY + 1;

        const canvas = Buffer.alloc(cw * ch, 255);
        for (const p of innerPoints) {
          canvas[(p.y - minY) * cw + (p.x - minX)] = 0;
        }

        const png = await sharp(canvas, { raw: { width: cw, height: ch, channels: 1 }, failOn: 'none' })
          .resize(cw * 4, ch * 4, { kernel: 'nearest' })
          .extend({ top: 30, bottom: 30, left: 30, right: 30, background: { r: 255, g: 255, b: 255 } })
          .resize(100, 100, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
          .withMetadata({ density: 300 })
          .png()
          .toBuffer();

        const ret = await worker.recognize(png);
        let txt = ret.data.text.trim().replace(/[^0-9\+\-\*lI|OQo=]/g, '');
        txt = txt.replace(/[lI|]/g, '1').replace(/[OQo]/g, '0');

        // Boshida kelgan noto'g'ri minusni tozalash
        if (results.length === 0 && txt === '-') {
          continue;
        }

        // Oxirgi tenglik (=) yoki oxirgi ortiqcha belgini tashlab yuborish
        const hasExistingOp = results.some(r => r === '+' || r === '-' || r === '*');
        if (i === circles.length - 1 && hasExistingOp && (txt === '-' || txt === '1' || txt === '=')) {
          continue;
        }

        if (txt && txt !== '=') {
          results.push(txt);
        }
      }

      let op = null;
      let opIdx = -1;
      for (let i = 0; i < results.length; i++) {
        if (results[i] === '+' || results[i] === '-' || results[i] === '*') {
          op = results[i];
          opIdx = i;
          break;
        }
      }

      if (op && opIdx > 0 && opIdx < results.length) {
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

      const cleanExpr = results.join('');
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
      this.logger.error('solveFullCaptchaWithWorker error:', err);
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
