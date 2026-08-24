import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { OpenBudgetModule } from './openbudget/openbudget.module';
import { WalletModule } from './wallet/wallet.module';
import { BotModule } from './bot/bot.module';
import { AdminModule } from './admin/admin.module';
import { WebAppModule } from './webapp/webapp.module';
import { ProxyModule } from './proxy/proxy.module';
import { ExternalBridgeModule } from './external-bridge/external-bridge.module';
import { HealthModule } from './health/health.module';
import { AgentModule } from './agent/agent.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/',
      serveStaticOptions: {
        setHeaders: (res, path) => {
          if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          }
        },
      },
    }),
    PrismaModule,
    ProxyModule,
    ExternalBridgeModule,
    HealthModule,
    AgentModule,
    OpenBudgetModule,
    WalletModule,
    BotModule,
    AdminModule,
    WebAppModule,
  ],
})
export class AppModule {}
