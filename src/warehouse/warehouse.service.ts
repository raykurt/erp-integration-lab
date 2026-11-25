import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm';
import { BusinessError } from '../common/errors';
import { AuthUser } from '../common/roles';
import { CreateMovementDto, MovementQuery, StockQuery } from './dto';
import { Item, MovementType, StockLevel, StockMovement, SyncStatus, Warehouse } from './entities';
import { checkWarehouses, ensureEnoughStock } from './warehouse-rules';

export interface StockRow {
  warehouse: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
}

const MOVEMENT_RELATIONS = { item: true, fromWarehouse: true, toWarehouse: true } as const;

@Injectable()
export class WarehouseService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  warehouses(): Promise<Warehouse[]> {
    return this.dataSource.getRepository(Warehouse).find({ order: { code: 'ASC' } });
  }

  items(): Promise<Item[]> {
    return this.dataSource.getRepository(Item).find({ order: { itemCode: 'ASC' } });
  }

  async stock(query: StockQuery): Promise<StockRow[]> {
    const qb = this.dataSource
      .getRepository(StockLevel)
      .createQueryBuilder('s')
      .innerJoin('s.warehouse', 'w')
      .innerJoin('s.item', 'i')
      .select(['w.code AS warehouse', 'i.itemCode AS "itemCode"', 'i.name AS "itemName"', 'i.unit AS unit', 's.quantity AS quantity'])
      .orderBy('w.code')
      .addOrderBy('i.itemCode');
    if (query.warehouse) qb.andWhere('w.code = :w', { w: query.warehouse });
    if (query.item) qb.andWhere('i.itemCode = :i', { i: query.item });
    return qb.getRawMany<StockRow>();
  }

  movements(query: MovementQuery): Promise<StockMovement[]> {
    return this.dataSource.getRepository(StockMovement).find({
      where: query.syncStatus ? { syncStatus: query.syncStatus } : {},
      relations: MOVEMENT_RELATIONS,
      order: { id: 'ASC' },
      take: 200,
    });
  }

  /**
   * Books a movement. Returns `replayed: true` when the same Idempotency-Key was already used for
   * the same request: the stored result is returned and stock is NOT changed again.
   */
  async createMovement(user: AuthUser, dto: CreateMovementDto, idempotencyKey?: string): Promise<{ movement: StockMovement; replayed: boolean }> {
    checkWarehouses(dto.type, dto.fromWarehouse, dto.toWarehouse);
    const requestHash = fingerprint(dto);

    if (idempotencyKey) {
      const previous = await this.findByKey(idempotencyKey, requestHash);
      if (previous) return { movement: previous, replayed: true };
    }

    try {
      const id = await this.dataSource.transaction((m) => this.book(m, user, dto, idempotencyKey ?? null, requestHash));
      return { movement: await this.load(id), replayed: false };
    } catch (e) {
      // Two identical requests raced: the unique index let only one through. Return that one.
      if (idempotencyKey && isUniqueViolation(e)) {
        const winner = await this.findByKey(idempotencyKey, requestHash);
        if (winner) return { movement: winner, replayed: true };
      }
      throw e;
    }
  }

  async retrySync(id: number): Promise<StockMovement> {
    const repo = this.dataSource.getRepository(StockMovement);
    const movement = await repo.findOneBy({ id });
    if (!movement) throw new BusinessError(HttpStatus.NOT_FOUND, 'MOVEMENT_NOT_FOUND', `Movement ${id} not found`);
    if (![SyncStatus.DEAD, SyncStatus.FAILED].includes(movement.syncStatus)) {
      throw new BusinessError(HttpStatus.CONFLICT, 'INVALID_SYNC_STATUS', `Movement is ${movement.syncStatus}`);
    }
    Object.assign(movement, { syncStatus: SyncStatus.PENDING, syncAttempts: 0, nextAttemptAt: new Date() });
    await repo.save(movement);
    return this.load(id);
  }

  private async book(m: EntityManager, user: AuthUser, dto: CreateMovementDto, key: string | null, requestHash: string): Promise<number> {
    const item = await m.findOneBy(Item, { itemCode: dto.itemCode });
    if (!item) throw new BusinessError(HttpStatus.NOT_FOUND, 'ITEM_NOT_FOUND', `Item ${dto.itemCode} not found`);
    const from = dto.fromWarehouse ? await this.warehouse(m, dto.fromWarehouse) : null;
    const to = dto.toWarehouse ? await this.warehouse(m, dto.toWarehouse) : null;
    const warehouseIds = [from?.id, to?.id].filter((x): x is number => x !== undefined);

    // Make sure a stock row exists, then lock the rows (always in the same order, to avoid deadlocks).
    await m
      .createQueryBuilder()
      .insert()
      .into(StockLevel)
      .values(warehouseIds.map((warehouseId) => ({ warehouseId, itemId: item.id, quantity: 0 })))
      .orIgnore()
      .execute();
    const levels = await m
      .createQueryBuilder(StockLevel, 's')
      .setLock('pessimistic_write')
      .where('s.itemId = :itemId', { itemId: item.id })
      .andWhere({ warehouseId: In(warehouseIds) })
      .orderBy('s.warehouseId')
      .getMany();
    const levelOf = (id: number) => levels.find((l) => l.warehouseId === id)!;

    if (from) {
      const source = levelOf(from.id);
      ensureEnoughStock(source.quantity, dto.quantity, item.itemCode, from.code);
      source.quantity -= dto.quantity;
    }
    if (to) levelOf(to.id).quantity += dto.quantity;
    await m.save(levels);

    // Outbox record: same transaction as the stock change.
    const movement = await m.save(
      m.create(StockMovement, {
        type: dto.type,
        itemId: item.id,
        fromWarehouseId: from?.id ?? null,
        toWarehouseId: to?.id ?? null,
        quantity: dto.quantity,
        note: dto.note ?? null,
        createdById: user.id,
        idempotencyKey: key,
        requestHash,
      }),
    );
    return movement.id;
  }

  private async warehouse(m: EntityManager, code: string): Promise<Warehouse> {
    const warehouse = await m.findOneBy(Warehouse, { code });
    if (!warehouse) throw new BusinessError(HttpStatus.NOT_FOUND, 'WAREHOUSE_NOT_FOUND', `Warehouse ${code} not found`);
    return warehouse;
  }

  private async findByKey(key: string, requestHash: string): Promise<StockMovement | null> {
    const previous = await this.dataSource.getRepository(StockMovement).findOne({
      where: { idempotencyKey: key },
      select: { id: true, requestHash: true },
    });
    if (!previous) return null;
    if (previous.requestHash !== requestHash) {
      throw new BusinessError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used for a different request',
      );
    }
    return this.load(previous.id);
  }

  private load(id: number): Promise<StockMovement> {
    return this.dataSource.getRepository(StockMovement).findOneOrFail({ where: { id }, relations: MOVEMENT_RELATIONS });
  }
}

function fingerprint(dto: CreateMovementDto): string {
  const { type, itemCode, fromWarehouse, toWarehouse, quantity, note } = dto;
  return createHash('sha256').update(JSON.stringify([type, itemCode, fromWarehouse, toWarehouse, quantity, note])).digest('hex');
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof QueryFailedError && (e as QueryFailedError & { code?: string }).code === '23505';
}
