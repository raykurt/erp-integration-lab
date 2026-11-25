import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { config } from './config';
import { Employee } from './employees/employee.entity';
import { EmployeesModule } from './employees/employees.module';
import { LeaveRequest } from './leave/leave-request.entity';
import { LeaveModule } from './leave/leave.module';
import { SeedService } from './seed/seed.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: config.databaseUrl,
      entities: [Employee, LeaveRequest],
      // Fine for a demo project. A production system would use migrations instead.
      synchronize: true,
    }),
    AuthModule,
    EmployeesModule,
    LeaveModule,
  ],
  providers: [SeedService],
})
export class AppModule {}
