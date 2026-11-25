import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { Role } from '../common/roles';
import { config } from '../config';
import { Employee } from '../employees/employee.entity';

/**
 * Demo data: one HR user, two managers, three employees.
 *   hulya (HR)
 *   mert (MANAGER)  → ayse (14 days), can (5 days)
 *   selin (MANAGER) → zeynep (14 days)
 * All users share the password from SEED_PASSWORD.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if ((await this.dataSource.getRepository(Employee).count()) === 0) {
      await this.seed();
      this.logger.log('Demo users created');
    }
  }

  /** Empties every table and seeds again. Only allowed in tests. */
  async reset(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') throw new Error('reset() is only allowed when NODE_ENV=test');
    await this.dataSource.query('TRUNCATE leave_requests, employees RESTART IDENTITY CASCADE');
    await this.seed();
  }

  private async seed(): Promise<void> {
    const repo = this.dataSource.getRepository(Employee);
    const passwordHash = await bcrypt.hash(config.seedPassword, 10);
    const add = (username: string, fullName: string, role: Role, managerId: number | null, balance = 14) =>
      repo.save(repo.create({ username, fullName, role, managerId, annualLeaveBalance: balance, passwordHash }));

    await add('hulya', 'Hülya Demir', Role.HR, null);
    const mert = await add('mert', 'Mert Kaya', Role.MANAGER, null);
    const selin = await add('selin', 'Selin Aydın', Role.MANAGER, null);
    await add('ayse', 'Ayşe Yılmaz', Role.EMPLOYEE, mert.id);
    await add('can', 'Can Şahin', Role.EMPLOYEE, mert.id, 5);
    await add('zeynep', 'Zeynep Arslan', Role.EMPLOYEE, selin.id);
  }
}
