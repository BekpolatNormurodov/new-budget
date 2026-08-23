import { Module, forwardRef } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminSpaController } from './admin-spa.controller';
import { WalletModule } from '../wallet/wallet.module';
import { OpenBudgetModule } from '../openbudget/openbudget.module';
import { BotModule } from '../bot/bot.module';

@Module({
  imports: [WalletModule, OpenBudgetModule, forwardRef(() => BotModule)],
  providers: [AdminService],
  controllers: [AdminController, AdminSpaController],
  exports: [AdminService],
})
export class AdminModule {}
