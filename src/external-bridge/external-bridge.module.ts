import { Module, Global } from '@nestjs/common';
import { ExternalBridgeService } from './external-bridge.service';

@Global()
@Module({
  providers: [ExternalBridgeService],
  exports: [ExternalBridgeService],
})
export class ExternalBridgeModule {}
