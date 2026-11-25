# ERP Integration Lab

[![CI](https://github.com/raykurt/erp-integration-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/raykurt/erp-integration-lab/actions/workflows/ci.yml)

An internal operations platform of the kind many manufacturing companies build next to their ERP:
employees request leave, warehouse staff book stock movements, and every movement is synchronised
with the ERP (a mock modelled on the **SAP Business One Service Layer**).

The project is built **test-first**: business rules are covered by fast unit tests, and the API is tested
end to end against a real PostgreSQL database and the mock ERP in CI, including failure scenarios
(ERP down, expired session, lost responses, parallel requests).

**Stack:** NestJS · TypeScript · PostgreSQL · TypeORM · JWT · Swagger · Jest · Supertest · GitHub Actions

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Leave management API with role-based access | ✅ Done |
| 2 | Warehouse module + ERP synchronisation (outbox, retries, duplicate protection) + mock SAP B1 Service Layer | ✅ Done |
| 3 | Next.js UI + Playwright end-to-end tests | 🔜 Next |

## Architecture

```
                        ┌──────────────────────── NestJS API ────────────────────────┐
 client ── JWT ──►      │ leave module      warehouse module        ERP sync worker  │
                        │                    │ stock change +          │ (timer or   │
                        │                    │ outbox row in ONE       │  POST /erp- │
                        │                    │ transaction             │  sync/run)  │
                        └────────────────────┼─────────────────────────┼─────────────┘
                                             ▼                         ▼
                                        PostgreSQL  ◄── reads outbox ──┘──► ERP (SAP B1 Service Layer / mock)
```

## Business rules

**Leave (phase 1)**

- Leave is counted in **working days** (weekends and fixed public holidays of Türkiye are skipped).
- Annual leave cannot exceed the available balance (balance − days waiting for approval).
- No overlapping requests. Only the direct manager or HR can decide; nobody decides on their own request.
- The balance is deducted on approval and refunded when an approved future leave is cancelled.

**Warehouse (phase 2)**

- `IN` needs a target warehouse, `OUT` a source, `TRANSFER` two different warehouses.
- Stock can never go negative: rows are locked (`SELECT … FOR UPDATE`, always in the same order to avoid
  deadlocks) and a database `CHECK (quantity >= 0)` is the last line of defence.
- An optional **`Idempotency-Key`** header makes retries safe: the same key and body return the original
  movement (200) without booking again; the same key with a different body is rejected (422).
- Only warehouse staff book movements; managers and HR can read stock.

**ERP synchronisation (phase 2)**

| Situation | Behaviour |
|---|---|
| Normal | Each movement becomes the matching ERP document: `IN` → `InventoryGenEntries`, `OUT` → `InventoryGenExits`, `TRANSFER` → `StockTransfers`. The returned `DocEntry` is stored. |
| ERP down / 5xx / timeout | Movement is marked `FAILED` and retried with exponential backoff. |
| Session expired (401) | Client logs in again and repeats the request once. |
| ERP saved the document but the response was lost | Before creating, the worker looks the document up by our reference (`U_ExtRef`), so a retry never creates a duplicate. |
| ERP rejects the data (4xx, e.g. unknown item) | Straight to `DEAD`: retrying bad data is pointless. Staff can re-queue it after the fix. |
| Too many attempts | `DEAD` after `SYNC_MAX_ATTEMPTS` (default 5). |
| Two workers at the same time | Rows are claimed with `FOR UPDATE SKIP LOCKED`, so each movement is sent once. |

Because the movement and its outbox state are written in the **same transaction** as the stock change
(transactional outbox), a movement can never be lost between "stock updated" and "ERP informed".

## Test strategy

| Level | Tool | Count | What it covers |
|---|---|---:|---|
| Unit | Jest | 47 | Working days, leave and warehouse rules, ERP payload mapping (contract), retry policy |
| API | Jest + Supertest + PostgreSQL + mock ERP | 73 | Auth and roles, validation, business rules, idempotency, concurrency, every ERP failure scenario above |

Highlights:

- **Tests that really guard something.** For the three most important safety tests I removed the protection
  on purpose and checked that the test fails:
  - no stock row lock → *"never oversells: 10 parallel issues of 3 from a stock of 20"* fails;
  - no lookup by `U_ExtRef` → *"does not create a duplicate when the response was lost"* fails;
  - no `SKIP LOCKED` claim → *"sends every movement exactly once when two sync runs overlap"* fails.
- **Same app as production:** API tests boot the real NestJS app with the same validation pipe and guard.
- **Isolated tests:** every test starts from a freshly seeded database and a clean mock ERP.
- **Fault injection:** the mock ERP can be told to fail the next N calls, expire sessions, save-then-fail,
  or reject an item, so failure paths are tested as thoroughly as the happy path.

## Run it locally

Requirements: Node.js 22 and Docker.

```bash
docker compose up -d                    # PostgreSQL 16
npm install
npm run mock-erp                        # terminal 1: mock SAP B1 Service Layer on :50000
SYNC_INTERVAL_MS=10000 npm run start:dev  # terminal 2: API on :3000, Swagger UI on /docs
npm run test:all                        # unit + API tests (start their own mock ERP)
```

Demo users (password `Passw0rd!`, local only; all data is fictional):

| User | Role | Notes |
|---|---|---|
| hulya | HR | sees all leave, can trigger ERP sync |
| mert, selin | Manager | approve their team's leave, read stock |
| ayse, can, zeynep | Employee | can has only 5 days of annual leave |
| deniz | Warehouse | books stock movements, triggers ERP sync |

Opening stock: `MAIN` GEN-100 ×5, FLT-OIL ×20, ATS-63 ×8 · `PROD` CBL-16 ×100 m.

## API

| Method | Endpoint | Who |
|---|---|---|
| POST | `/auth/login` | everyone |
| GET | `/employees/me` · `/employees` | any user · HR |
| POST / GET | `/leave-requests` | own request · scoped by role |
| POST | `/leave-requests/:id/approve` · `reject` · `cancel` | manager/HR · manager/HR · owner |
| GET | `/warehouses` · `/items` · `/stock?warehouse=&item=` | warehouse, manager, HR |
| POST | `/stock-movements` (optional `Idempotency-Key` header) | warehouse |
| GET | `/stock-movements?syncStatus=` | warehouse, manager, HR |
| POST | `/stock-movements/:id/retry-sync` | warehouse, HR |
| POST | `/erp-sync/run` | warehouse, HR |

Full schemas are in Swagger UI at `/docs`.

## Notes

- The mock implements only the parts of the SAP Business One Service Layer this project uses (login and
  session cookie, three document types, lookup by a user-defined field, the error format). It is a test
  double, not a replacement for the real product.
- Item and warehouse codes are the same in both systems to keep the demo simple; a real integration would
  map them.
- `synchronize: true` creates tables automatically for the demo; production would use migrations.
