import { Module } from '@nestjs/common';
import { WebAppController } from './webapp.controller';
import { OpenBudgetModule } from '../openbudget/openbudget.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [OpenBudgetModule, WalletModule],
  controllers: [WebAppController],
})
export class WebAppModule {}
