import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { config } from './config';
import { Employee } from './employees/employee.entity';
import { EmployeesModule } from './employees/employees.module';
import { ErpModule } from './erp/erp.module';
import { LeaveRequest } from './leave/leave-request.entity';
import { LeaveModule } from './leave/leave.module';
import { SeedService } from './seed/seed.service';
import { TestSupportController } from './seed/test-support.controller';
import { Item, StockLevel, StockMovement, Warehouse } from './warehouse/entities';
import { WarehouseModule } from './warehouse/warehouse.module';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        url: config.databaseUrl,
        entities: [Employee, LeaveRequest, Warehouse, Item, StockLevel, StockMovement],
        // Fine for a demo project. A production system would use migrations instead.
        synchronize: true,
      }),
    }),
    AuthModule,
    EmployeesModule,
    LeaveModule,
    WarehouseModule,
    ErpModule,
  ],
  controllers: [TestSupportController],
  providers: [SeedService],
})
export class AppModule {}
