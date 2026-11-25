import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, LessThanOrEqual } from 'typeorm';
import { config } from '../config';
import { Item, StockMovement, SyncStatus, Warehouse } from '../warehouse/entities';
import { ErpClient, ErpError } from './erp-client';
import { retryDelayMs, toErpRequest } from './erp-mapping';

export interface SyncRunResult {
  synced: number;
  failed: number;
  dead: number;
  skipped: number;
}

type Outcome = keyof SyncRunResult;

/**
 * Sends outbox records (stock movements) to the ERP.
 *
 * Safety rules:
 *  - Each movement row is locked with FOR UPDATE SKIP LOCKED, so two workers never send the same movement.
 *  - Before creating a document we look it up by our external reference. If an earlier attempt reached the
 *    ERP but the response was lost (timeout, 500 after commit), we only record the existing DocEntry
 *    instead of creating a duplicate document.
 *  - Temporary errors are retried with exponential backoff; data errors or too many attempts → DEAD.
 */
@Injectable()
export class SyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(@InjectDataSource() private readonly dataSource: DataSource, private readonly erp: ErpClient) {}

  onModuleInit(): void {
    if (config.sync.intervalMs > 0) {
      this.timer = setInterval(() => this.runScheduled().catch((e) => this.logger.error(e)), config.sync.intervalMs);
      this.logger.log(`Background ERP sync every ${config.sync.intervalMs} ms`);
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** The background timer skips a tick while the previous run is still busy. */
  async runScheduled(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } finally {
      this.running = false;
    }
  }

  async runOnce(batchSize = 50): Promise<SyncRunResult> {
    const due = await this.dataSource.getRepository(StockMovement).find({
      select: { id: true },
      where: { syncStatus: In([SyncStatus.PENDING, SyncStatus.FAILED]), nextAttemptAt: LessThanOrEqual(new Date()) },
      order: { id: 'ASC' },
      take: batchSize,
    });

    const result: SyncRunResult = { synced: 0, failed: 0, dead: 0, skipped: 0 };
    for (const { id } of due) result[await this.syncOne(id)]++;
    return result;
  }

  private syncOne(id: number): Promise<Outcome> {
    return this.dataSource.transaction(async (m) => {
      const movement = await m.findOne(StockMovement, {
        where: { id },
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
      });
      // Locked by another worker, or already handled since we listed it.
      if (!movement || ![SyncStatus.PENDING, SyncStatus.FAILED].includes(movement.syncStatus)) return 'skipped';

      movement.syncAttempts++;
      try {
        const request = toErpRequest(await this.withCodes(m, movement));
        const existing = await this.erp.findByExternalRef(request.entity, request.externalRef);
        movement.erpDocEntry = existing ?? (await this.erp.create(request.entity, request.body));
        movement.syncStatus = SyncStatus.SYNCED;
        movement.syncedAt = new Date();
        movement.lastSyncError = null;
        await m.save(movement);
        return 'synced';
      } catch (e) {
        const error = e instanceof ErpError ? e : new ErpError((e as Error).message, 400);
        const giveUp = !error.retryable || movement.syncAttempts >= config.sync.maxAttempts;
        movement.syncStatus = giveUp ? SyncStatus.DEAD : SyncStatus.FAILED;
        movement.lastSyncError = error.message.slice(0, 1000);
        movement.nextAttemptAt = new Date(Date.now() + retryDelayMs(movement.syncAttempts, config.sync.backoffMs));
        await m.save(movement);
        this.logger.warn(`Movement ${id} → ${movement.syncStatus}: ${error.message}`);
        return giveUp ? 'dead' : 'failed';
      }
    });
  }

  private async withCodes(m: EntityManager, mv: StockMovement) {
    const code = async (id: number | null) => (id ? (await m.findOneByOrFail(Warehouse, { id })).code : null);
    return {
      id: mv.id,
      type: mv.type,
      quantity: mv.quantity,
      createdAt: mv.createdAt,
      itemCode: (await m.findOneByOrFail(Item, { id: mv.itemId })).itemCode,
      fromWarehouseCode: await code(mv.fromWarehouseId),
      toWarehouseCode: await code(mv.toWarehouseId),
    };
  }
}
