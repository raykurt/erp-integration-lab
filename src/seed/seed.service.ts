import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { Role } from '../common/roles';
import { config } from '../config';
import { Employee } from '../employees/employee.entity';
import { Item, StockLevel, Warehouse } from '../warehouse/entities';

/** Item and warehouse codes match the master data of the mock ERP (mock-erp/mock-erp.ts). */
export const SEED_WAREHOUSES = [
  { code: 'MAIN', name: 'Main warehouse' },
  { code: 'PROD', name: 'Production warehouse' },
  { code: 'SHIP', name: 'Shipping warehouse' },
];
export const SEED_ITEMS = [
  { itemCode: 'GEN-100', name: 'Diesel generator 100 kVA', unit: 'pcs' },
  { itemCode: 'ATS-63', name: 'Automatic transfer switch 63A', unit: 'pcs' },
  { itemCode: 'FLT-OIL', name: 'Oil filter', unit: 'pcs' },
  { itemCode: 'CBL-16', name: 'Power cable 16 mm²', unit: 'm' },
];
/** Opening stock: [warehouse, item, quantity]. */
const OPENING_STOCK: [string, string, number][] = [
  ['MAIN', 'GEN-100', 5],
  ['MAIN', 'FLT-OIL', 20],
  ['MAIN', 'ATS-63', 8],
  ['PROD', 'CBL-16', 100],
];

/**
 * Demo data (all fictional). Users share the password from SEED_PASSWORD.
 *   hulya (HR) · mert (MANAGER) → ayse, can · selin (MANAGER) → zeynep · deniz (WAREHOUSE)
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if ((await this.dataSource.getRepository(Employee).count()) === 0) {
      await this.seed();
      this.logger.log('Demo data created');
    }
  }

  /** Empties every table and seeds again. Only allowed in tests. */
  async reset(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') throw new Error('reset() is only allowed when NODE_ENV=test');
    await this.dataSource.query(
      'TRUNCATE leave_requests, stock_movements, stock_levels, items, warehouses, employees RESTART IDENTITY CASCADE',
    );
    await this.seed();
  }

  private async seed(): Promise<void> {
    const employees = this.dataSource.getRepository(Employee);
    const passwordHash = await bcrypt.hash(config.seedPassword, 10);
    const add = (username: string, fullName: string, role: Role, managerId: number | null, balance = 14) =>
      employees.save(employees.create({ username, fullName, role, managerId, annualLeaveBalance: balance, passwordHash }));

    await add('hulya', 'Hülya Demir', Role.HR, null);
    const mert = await add('mert', 'Mert Kaya', Role.MANAGER, null);
    const selin = await add('selin', 'Selin Aydın', Role.MANAGER, null);
    await add('ayse', 'Ayşe Yılmaz', Role.EMPLOYEE, mert.id);
    await add('can', 'Can Şahin', Role.EMPLOYEE, mert.id, 5);
    await add('zeynep', 'Zeynep Arslan', Role.EMPLOYEE, selin.id);
    await add('deniz', 'Deniz Koç', Role.WAREHOUSE, null);

    const warehouses = await this.dataSource.getRepository(Warehouse).save(SEED_WAREHOUSES);
    const items = await this.dataSource.getRepository(Item).save(SEED_ITEMS);
    await this.dataSource.getRepository(StockLevel).save(
      OPENING_STOCK.map(([w, i, quantity]) => ({
        warehouseId: warehouses.find((x) => x.code === w)!.id,
        itemId: items.find((x) => x.itemCode === i)!.id,
        quantity,
      })),
    );
  }
}
