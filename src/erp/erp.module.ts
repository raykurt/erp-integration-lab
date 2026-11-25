import { Module } from '@nestjs/common';
import { ErpClient } from './erp-client';
import { ErpController } from './erp.controller';
import { SyncService } from './sync.service';

@Module({
  controllers: [ErpController],
  providers: [ErpClient, SyncService],
  exports: [SyncService],
})
export class ErpModule {}
