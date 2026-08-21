import { Module } from '@nestjs/common';
import { BotManagerService } from './bot-manager.service';
import { BotMarketingService } from './bot-marketing.service';
import { OpenBudgetModule } from '../openbudget/openbudget.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [OpenBudgetModule, WalletModule],
  providers: [BotManagerService, BotMarketingService],
  exports: [BotManagerService, BotMarketingService],
})
export class BotModule {}
