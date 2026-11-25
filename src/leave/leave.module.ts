import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from '../employees/employee.entity';
import { LeaveRequest } from './leave-request.entity';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

@Module({
  imports: [TypeOrmModule.forFeature([LeaveRequest, Employee])],
  controllers: [LeaveController],
  providers: [LeaveService],
})
export class LeaveModule {}
