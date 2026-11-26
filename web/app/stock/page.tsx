'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Nav } from '@/components/Nav';
import { Alert, Status } from '@/components/Status';
import { api, errorText } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Item, Movement, StockRow, Warehouse } from '@/lib/types';

type MovementType = 'IN' | 'OUT' | 'TRANSFER';

export default function StockPage() {
  const { me } = useSession();
  const [stock, setStock] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [type, setType] = useState<MovementType>('TRANSFER');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const allowed = me && me.role !== 'EMPLOYEE';
  const isWarehouse = me?.role === 'WAREHOUSE';
  const canSync = me?.role === 'WAREHOUSE' || me?.role === 'HR';

  const load = useCallback(async () => {
    const [s, m] = await Promise.all([api<StockRow[]>('/stock'), api<Movement[]>('/stock-movements')]);
    setStock(s);
    setMovements(m);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    Promise.all([load(), api<Item[]>('/items').then(setItems), api<Warehouse[]>('/warehouses').then(setWarehouses)]).catch((e) =>
      setError(errorText(e)),
    );
  }, [allowed, load]);

  async function run(action: () => Promise<string>) {
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
      await load();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  }

  async function book(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const ok = await run(async () => {
      await api('/stock-movements', {
        method: 'POST',
        // A fresh key per submission: if the network drops and the browser retries, stock is not booked twice.
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: {
          type,
          itemCode: form.get('itemCode'),
          ...(type !== 'IN' ? { fromWarehouse: form.get('fromWarehouse') } : {}),
          ...(type !== 'OUT' ? { toWarehouse: form.get('toWarehouse') } : {}),
          quantity: Number(form.get('quantity')),
        },
      });
      return 'Movement booked';
    });
    if (ok) formEl.reset();
  }

  const sync = () =>
    run(async () => {
      const r = await api<{ synced: number; failed: number; dead: number }>('/erp-sync/run', { method: 'POST' });
      return `ERP sync finished: ${r.synced} synced, ${r.failed} failed, ${r.dead} dead`;
    });

  if (!me) return <main className="muted">Loading…</main>;

  return (
    <>
      <Nav me={me} />
      <main>
        <h1>Stock</h1>
        {!allowed ? (
          <Alert message="You do not have access to stock." />
        ) : (
          <>
            <Alert message={error} />
            <Alert message={notice} kind="success" />

            {isWarehouse && warehouses.length > 0 && items.length > 0 && (
              <section className="card" aria-labelledby="new-movement">
                <h2 id="new-movement">Book a movement</h2>
                <form className="grid" onSubmit={book}>
                  <label>
                    Movement type
                    <select value={type} onChange={(e) => setType(e.target.value as MovementType)}>
                      <option value="IN">Goods receipt (IN)</option>
                      <option value="OUT">Goods issue (OUT)</option>
                      <option value="TRANSFER">Transfer</option>
                    </select>
                  </label>
                  <label>
                    Item
                    <select name="itemCode" required>
                      {items.map((i) => (
                        <option key={i.itemCode} value={i.itemCode}>
                          {i.itemCode} – {i.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {type !== 'IN' && <WarehouseSelect name="fromWarehouse" label="From warehouse" warehouses={warehouses} />}
                  {type !== 'OUT' && <WarehouseSelect name="toWarehouse" label="To warehouse" warehouses={warehouses} defaultIndex={type === 'TRANSFER' ? 2 : 0} />}
                  <label>
                    Quantity
                    <input name="quantity" type="number" min={1} step={1} required />
                  </label>
                  <button type="submit">Book movement</button>
                </form>
              </section>
            )}

            <section className="card" aria-labelledby="stock-levels">
              <h2 id="stock-levels">Stock levels</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Warehouse</th>
                      <th>Item</th>
                      <th>Name</th>
                      <th className="num">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stock.map((s) => (
                      <tr key={`${s.warehouse}-${s.itemCode}`} data-testid={`stock-${s.warehouse}-${s.itemCode}`}>
                        <td>{s.warehouse}</td>
                        <td>{s.itemCode}</td>
                        <td>{s.itemName}</td>
                        <td className="num" data-testid="quantity">
                          {s.quantity} {s.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card" aria-labelledby="movements">
              <div className="row-between">
                <h2 id="movements">Movements and ERP sync</h2>
                {canSync && <button onClick={sync}>Sync to ERP</button>}
              </div>
              {movements.length === 0 ? (
                <p className="empty">No movements yet.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Type</th>
                        <th>Item</th>
                        <th>From → To</th>
                        <th className="num">Qty</th>
                        <th>ERP status</th>
                        <th>ERP document</th>
                        <th>Last error</th>
                        {canSync && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((m) => (
                        <tr key={m.id} data-testid="movement">
                          <td>{m.id}</td>
                          <td>{m.type}</td>
                          <td>{m.item.itemCode}</td>
                          <td>
                            {m.fromWarehouse?.code ?? '–'} → {m.toWarehouse?.code ?? '–'}
                          </td>
                          <td className="num">{m.quantity}</td>
                          <td>
                            <Status value={m.syncStatus} />
                          </td>
                          <td data-testid="erp-doc">{m.erpDocEntry ?? ''}</td>
                          <td className="muted">{m.lastSyncError ?? ''}</td>
                          {canSync && (
                            <td>
                              {(m.syncStatus === 'DEAD' || m.syncStatus === 'FAILED') && (
                                <button className="secondary" onClick={() => run(async () => {
                                  await api(`/stock-movements/${m.id}/retry-sync`, { method: 'POST' });
                                  return `Movement ${m.id} queued again`;
                                })}>
                                  Retry
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}

function WarehouseSelect(props: { name: string; label: string; warehouses: Warehouse[]; defaultIndex?: number }) {
  return (
    <label>
      {props.label}
      <select name={props.name} required defaultValue={props.warehouses[props.defaultIndex ?? 0]?.code}>
        {props.warehouses.map((w) => (
          <option key={w.code} value={w.code}>
            {w.code} – {w.name}
          </option>
        ))}
      </select>
    </label>
  );
}
