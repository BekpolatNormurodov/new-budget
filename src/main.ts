// Increase libuv threadpool size for multi-core Sharp, crypto & network operations
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '128';

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
