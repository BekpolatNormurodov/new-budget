// Increase libuv threadpool size for multi-core Sharp, crypto & network operations
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '128';

// 📝 Barcha konsol loglarini (stdout/stderr) doimiy faylga ham yozib borish.
// SABAB: har safar deploy qilinganda docker konteyner butunlay yangisi bilan
// almashtiriladi va eski konteynerning `docker logs` tarixi yo'qolib qoladi —
// shu sababli muammoni diagnostika qilish uchun kerakli loglar ko'p marta
// yo'qolib ketdi. Endi loglar /app/logs ichida (docker volume orqali konteyner
// qayta tiklansa ham saqlanadigan joyda) kunlik faylga ham yoziladi.
(() => {
  try {
    const fs = require('fs');
    const path = require('path');
    const logsDir = process.env.LOGS_DIR || '/app/logs';
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

    const getLogFilePath = () => {
      const d = new Date();
      const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      return path.join(logsDir, `app-${dateStr}.log`);
    };

    const origStdoutWrite = process.stdout.write.bind(process.stdout);
    const origStderrWrite = process.stderr.write.bind(process.stderr);

    const appendToFile = (chunk: any) => {
      try {
        fs.appendFileSync(getLogFilePath(), chunk);
      } catch {
        // Fayl yozishda xato bo'lsa ham, dastur ishlashda davom etishi kerak
      }
    };

    (process.stdout.write as any) = (chunk: any, ...args: any[]) => {
      appendToFile(chunk);
      return origStdoutWrite(chunk, ...args);
    };
    (process.stderr.write as any) = (chunk: any, ...args: any[]) => {
      appendToFile(chunk);
      return origStderrWrite(chunk, ...args);
    };
  } catch {
    // Fayl-logging o'rnatilmasa ham, konsolga yozish davom etadi
  }
})();

// Enable automatic JSON serialization for BigInt across all Prisma models and endpoints
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import * as compression from 'compression';
import * as os from 'os';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // High-performance gzip/deflate compression for all HTTP/Admin responses
  app.use(compression());

  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 3000;

  const cpuCount = os.cpus()?.length || 1;
  const totalMemMb = Math.round(os.totalmem() / 1024 / 1024);

  await app.listen(port, '0.0.0.0');
  logger.log(`⚡ Server Hardware: ${cpuCount} CPU Core(s), ${totalMemMb} MB RAM allocated`);
  logger.log(`🚀 Open Budget High-Load Engine running at: http://0.0.0.0:${port}`);
  logger.log(`📱 Mini App Web View: http://localhost:${port}/app`);
  logger.log(`👑 Admin Dashboard: http://localhost:${port}/admin-view`);
}

bootstrap();
