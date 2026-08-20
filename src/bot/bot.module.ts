import { Module } from '@nestjs/common';
import { BotManagerService } from './bot-manager.service';
import { OpenBudgetModule } from '../openbudget/openbudget.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [OpenBudgetModule, WalletModule],
  providers: [BotManagerService],
  exports: [BotManagerService],
})
export class BotModule {}
