import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('warehouses')
export class Warehouse {
  @PrimaryGeneratedColumn()
  id: number;

  /** Same code as in the ERP (WarehouseCode in SAP Business One). */
  @Column({ unique: true })
  code: string;

  @Column()
  name: string;
}

@Entity('items')
export class Item {
  @PrimaryGeneratedColumn()
  id: number;

  /** Same code as in the ERP (ItemCode in SAP Business One). */
  @Column({ unique: true })
  itemCode: string;

  @Column()
  name: string;

  @Column({ default: 'pcs' })
  unit: string;
}

@Entity('stock_levels')
@Unique(['warehouseId', 'itemId'])
// Last line of defence: even a bug in the service cannot make stock negative.
@Check('"quantity" >= 0')
export class StockLevel {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  warehouseId: number;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouseId' })
  warehouse?: Warehouse;

  @Column()
  itemId: number;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'itemId' })
  item?: Item;

  @Column({ type: 'int', default: 0 })
  quantity: number;
}

export enum MovementType {
  IN = 'IN',
  OUT = 'OUT',
  TRANSFER = 'TRANSFER',
}

export enum SyncStatus {
  /** Saved locally, waiting to be sent to the ERP. */
  PENDING = 'PENDING',
  /** Sent and confirmed by the ERP (erpDocEntry is set). */
  SYNCED = 'SYNCED',
  /** Last attempt failed with a temporary error; will be retried after nextAttemptAt. */
  FAILED = 'FAILED',
  /** Permanent error or too many attempts; needs a person to look at it. */
  DEAD = 'DEAD',
}

/**
 * A stock movement is also the outbox record for the ERP:
 * it is written in the same transaction as the stock change, so a movement can never be lost
 * between "stock updated" and "ERP informed" (transactional outbox pattern).
 */
@Entity('stock_movements')
export class StockMovement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  type: MovementType;

  @Column()
  itemId: number;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'itemId' })
  item?: Item;

  @Column({ type: 'int', nullable: true })
  fromWarehouseId: number | null;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'fromWarehouseId' })
  fromWarehouse?: Warehouse | null;

  @Column({ type: 'int', nullable: true })
  toWarehouseId: number | null;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'toWarehouseId' })
  toWarehouse?: Warehouse | null;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column()
  createdById: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  /** Client-supplied Idempotency-Key header: retrying the same POST never books stock twice. */
  @Index({ unique: true, where: '"idempotencyKey" IS NOT NULL' })
  @Column({ type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  /** Fingerprint of the request body, to detect a key reused for a different request. */
  @Column({ type: 'varchar', nullable: true, select: false })
  requestHash: string | null;

  @Index()
  @Column({ type: 'varchar', default: SyncStatus.PENDING })
  syncStatus: SyncStatus;

  @Column({ type: 'int', default: 0 })
  syncAttempts: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  nextAttemptAt: Date;

  @Column({ type: 'text', nullable: true })
  lastSyncError: string | null;

  /** Document number returned by the ERP. */
  @Column({ type: 'int', nullable: true })
  erpDocEntry: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  syncedAt: Date | null;
}
