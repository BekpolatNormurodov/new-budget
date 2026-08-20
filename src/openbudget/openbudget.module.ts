import { Module } from '@nestjs/common';
import { CaptchaSolverService } from './captcha-solver.service';
import { OpenBudgetService } from './openbudget.service';

@Module({
  providers: [CaptchaSolverService, OpenBudgetService],
  exports: [CaptchaSolverService, OpenBudgetService],
})
export class OpenBudgetModule {}
