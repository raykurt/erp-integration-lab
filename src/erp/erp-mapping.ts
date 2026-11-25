import { MovementType } from '../warehouse/entities';

/**
 * Pure mapping from a local stock movement to a SAP Business One Service Layer request.
 * Kept free of I/O so the "contract" with the ERP is covered by unit tests (erp-mapping.spec.ts).
 *
 *   IN       → POST /InventoryGenEntries  (goods receipt)
 *   OUT      → POST /InventoryGenExits    (goods issue)
 *   TRANSFER → POST /StockTransfers
 */

export interface MovementForErp {
  id: number;
  type: MovementType;
  itemCode: string;
  quantity: number;
  fromWarehouseCode: string | null;
  toWarehouseCode: string | null;
  createdAt: Date;
}

export interface ErpRequest {
  entity: 'InventoryGenEntries' | 'InventoryGenExits' | 'StockTransfers';
  /** Our reference, stored in the ERP document so we can find it again (duplicate protection). */
  externalRef: string;
  body: Record<string, unknown>;
}

export const externalRefFor = (movementId: number) => `ERPLAB-MOV-${movementId}`;

export function toErpRequest(m: MovementForErp): ErpRequest {
  const externalRef = externalRefFor(m.id);
  const header = {
    DocDate: m.createdAt.toISOString().slice(0, 10),
    Comments: `Stock movement ${m.id} from erp-integration-lab`,
    // User-defined field (UDF). In SAP Business One custom fields start with "U_".
    U_ExtRef: externalRef,
  };

  switch (m.type) {
    case MovementType.IN:
      return {
        entity: 'InventoryGenEntries',
        externalRef,
        body: { ...header, DocumentLines: [{ ItemCode: m.itemCode, Quantity: m.quantity, WarehouseCode: required(m.toWarehouseCode) }] },
      };
    case MovementType.OUT:
      return {
        entity: 'InventoryGenExits',
        externalRef,
        body: { ...header, DocumentLines: [{ ItemCode: m.itemCode, Quantity: m.quantity, WarehouseCode: required(m.fromWarehouseCode) }] },
      };
    case MovementType.TRANSFER:
      return {
        entity: 'StockTransfers',
        externalRef,
        body: {
          ...header,
          FromWarehouse: required(m.fromWarehouseCode),
          ToWarehouse: required(m.toWarehouseCode),
          StockTransferLines: [
            {
              ItemCode: m.itemCode,
              Quantity: m.quantity,
              FromWarehouseCode: required(m.fromWarehouseCode),
              WarehouseCode: required(m.toWarehouseCode),
            },
          ],
        },
      };
  }
}

function required(code: string | null): string {
  if (!code) throw new Error('Warehouse code is missing for this movement type');
  return code;
}

/** Exponential backoff: base, 2×base, 4×base … capped at one hour. */
export function retryDelayMs(attempt: number, baseMs: number): number {
  return Math.min(baseMs * 2 ** Math.max(attempt - 1, 0), 60 * 60 * 1000);
}

/** Temporary problems are retried; anything else (bad data) goes straight to DEAD. */
export function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;
}
