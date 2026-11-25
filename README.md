# ERP Integration Lab

[![CI](https://github.com/raykurt/erp-integration-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/raykurt/erp-integration-lab/actions/workflows/ci.yml)

An internal operations platform of the kind many manufacturing companies build next to their ERP:
employees request leave, managers approve it, and (in the next phases) warehouse stock movements are
synchronised with an ERP system.

The project is built **test-first**: the business rules are covered by fast unit tests, and the API is
tested end to end against a real PostgreSQL database in CI.

**Stack:** NestJS · TypeScript · PostgreSQL · TypeORM · JWT · Swagger · Jest · Supertest · GitHub Actions

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Leave management API with role-based access + unit and API tests | ✅ Done |
| 2 | Warehouse module (stock in / out / transfer) + sync to a **mock ERP API** (modelled on SAP Business One Service Layer) with retry queue and duplicate protection | ⏳ Next |
| 3 | Next.js UI + Playwright end-to-end tests | 🔜 Planned |

## Business rules (phase 1)

- Leave length is counted in **working days**: weekends and fixed public holidays of Türkiye are skipped.
- Annual leave cannot exceed the **available balance** = balance − days already waiting for approval.
- A request cannot **overlap** another pending or approved request of the same employee.
- Only the **direct manager** or **HR** can approve or reject; nobody can decide on their own request.
- The balance is deducted **on approval**, not on request, and refunded when an approved future leave is cancelled.
- A rejection needs a **reason**.
- Employees see their own requests, managers also see their team, HR sees everything.

Errors use a stable `code` field (for example `INSUFFICIENT_BALANCE`, `OVERLAPPING_REQUEST`), so clients
and tests do not depend on message text.

## Test strategy

| Level | Tool | Count | What it covers |
|---|---|---:|---|
| Unit | Jest | 22 | Working-day calculation, date validation, balance and permission rules |
| API | Jest + Supertest + PostgreSQL | 40 | Authentication, role-based access, validation, business rules, state transitions, data visibility, concurrency |

Highlights:

- **Same app as production:** the API tests boot the real NestJS app with the same validation pipe and
  auth guard (`src/setup.ts`), not mocks.
- **Isolated tests:** every test starts from a freshly seeded database.
- **Concurrency test:** 10 approval calls for the same request are sent at the same time; exactly one must
  succeed and the balance must be deducted once. The service uses row locks (`SELECT … FOR UPDATE`);
  removing them makes this test fail, which proves the test really guards the behaviour.
- **Security checks:** missing or tampered tokens, role restrictions, no password hash in responses, the same
  error for "unknown user" and "wrong password", and unexpected request fields rejected.

## Run it locally

Requirements: Node.js 22 and Docker.

```bash
docker compose up -d          # PostgreSQL 16 on localhost:5432
npm install
npm run start:dev             # API on http://localhost:3000, Swagger UI on /docs
npm run test:all              # unit + API tests
```

Demo users are created on first start (password `Passw0rd!`, local only):

| User | Role | Reports to | Annual balance |
|---|---|---|---:|
| hulya | HR | – | 14 |
| mert | Manager | – | 14 |
| selin | Manager | – | 14 |
| ayse | Employee | mert | 14 |
| can | Employee | mert | 5 |
| zeynep | Employee | selin | 14 |

## API

| Method | Endpoint | Who |
|---|---|---|
| POST | `/auth/login` | everyone |
| GET | `/employees/me` | any user |
| GET | `/employees` | HR |
| POST | `/leave-requests` | any user (own request) |
| GET | `/leave-requests?status=` | scoped by role |
| GET | `/leave-requests/:id` | owner, their manager, HR |
| POST | `/leave-requests/:id/approve` | direct manager, HR |
| POST | `/leave-requests/:id/reject` | direct manager, HR (reason required) |
| POST | `/leave-requests/:id/cancel` | owner |

Full request and response schemas are in Swagger UI at `/docs`.

## Notes

- `synchronize: true` creates the tables automatically to keep the demo simple; a production system
  would use migrations.
- Religious public holidays move every year, so only fixed-date holidays are built in.
- All data is fictional.
