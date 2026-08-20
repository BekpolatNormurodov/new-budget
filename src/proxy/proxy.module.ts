import { Module, Global } from '@nestjs/common';
import { ProxyManagerService } from './proxy-manager.service';

@Global()
@Module({
  providers: [ProxyManagerService],
  exports: [ProxyManagerService],
})
export class ProxyModule {}
