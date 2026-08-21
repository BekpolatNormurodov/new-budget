import { Module } from '@nestjs/common';
import { CaptchaSolverService } from './captcha-solver.service';
import { OpenBudgetService } from './openbudget.service';
import { VoteAutoApproverService } from './vote-auto-approver.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  providers: [CaptchaSolverService, OpenBudgetService, VoteAutoApproverService],
  exports: [CaptchaSolverService, OpenBudgetService, VoteAutoApproverService],
})
export class OpenBudgetModule {}

