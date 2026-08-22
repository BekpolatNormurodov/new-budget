import { Module } from '@nestjs/common';
import { BotManagerService } from './bot-manager.service';
import { BotMarketingService } from './bot-marketing.service';
import { OpenBudgetModule } from '../openbudget/openbudget.module';
import { WalletModule } from '../wallet/wallet.module';
import { ProxyModule } from '../proxy/proxy.module';

@Module({
  imports: [OpenBudgetModule, WalletModule, ProxyModule],
  providers: [BotManagerService, BotMarketingService],
  exports: [BotManagerService, BotMarketingService],
})
export class BotModule {}
