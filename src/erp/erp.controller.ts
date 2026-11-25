import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../common/roles';
import { SyncRunResult, SyncService } from './sync.service';

@ApiTags('erp-sync')
@ApiBearerAuth()
@Controller('erp-sync')
export class ErpController {
  constructor(private readonly sync: SyncService) {}

  /** Sends all due movements to the ERP now (the background worker does the same on a timer). */
  @Post('run')
  @HttpCode(200)
  @Roles(Role.WAREHOUSE, Role.HR)
  run(): Promise<SyncRunResult> {
    return this.sync.runOnce();
  }
}
