import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from '../common/roles';

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  fullName: string;

  /** Never returned by default queries. */
  @Column({ select: false })
  passwordHash: string;

  @Column({ type: 'varchar' })
  role: Role;

  @Column({ type: 'int', nullable: true })
  managerId: number | null;

  /** Remaining annual leave in working days. */
  @Column({ type: 'int', default: 14 })
  annualLeaveBalance: number;
}
