import { Module, Global } from '@nestjs/common';
import { SystemHealthService } from './system-health.service';
import { OpenBudgetModule } from '../openbudget/openbudget.module';
import { BotModule } from '../bot/bot.module';

@Global()
@Module({
  imports: [OpenBudgetModule, BotModule],
  providers: [SystemHealthService],
  exports: [SystemHealthService],
})
export class HealthModule {}
