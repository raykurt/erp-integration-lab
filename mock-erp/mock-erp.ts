import { randomUUID } from 'crypto';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';

/**
 * A small stand-in for the SAP Business One Service Layer, used in tests and for local runs.
 * It implements only what this project needs, with the same URLs, session cookie and error format:
 *
 *   POST /b1s/v1/Login                                → B1SESSION cookie + SessionId
 *   POST /b1s/v1/InventoryGenEntries | InventoryGenExits | StockTransfers
 *   GET  /b1s/v1/<entity>?$filter=U_ExtRef eq '...'   → find a document by our reference
 *
 * Tests can inject failures: ERP down, session expiry, "saved but the response was lost", unknown items.
 */

const ENTITIES = ['InventoryGenEntries', 'InventoryGenExits', 'StockTransfers'] as const;
type Entity = (typeof ENTITIES)[number];

export interface ErpDocument {
  DocEntry: number;
  DocNum: number;
  [field: string]: unknown;
}

export const MOCK_ERP_ITEMS = ['GEN-100', 'ATS-63', 'FLT-OIL', 'CBL-16'];
export const MOCK_ERP_WAREHOUSES = ['MAIN', 'PROD', 'SHIP'];

export class MockErp {
  private server: Server | null = null;
  private sessions = new Set<string>();
  private docs = new Map<Entity, ErpDocument[]>();
  private nextDocEntry = 1;
  private failNextCount = 0;
  private failStatus = 503;
  private saveThenFailCount = 0;
  private unknownItems = new Set<string>();
  /** Number of POST requests that tried to create a document (for duplicate checks in tests). */
  createAttempts = 0;
  loginCount = 0;

  constructor(private readonly credentials = { user: 'manager', password: 'demo-only' }) {
    this.reset();
  }

  async start(port = 0): Promise<string> {
    this.server = createServer((req, res) => this.handle(req, res).catch((e) => this.error(res, 500, -1, String(e))));
    await new Promise<void>((resolve) => this.server!.listen(port, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/b1s/v1`;
  }

  async stop(): Promise<void> {
    if (this.server) await new Promise<void>((resolve) => this.server!.close(() => resolve()));
  }

  // ---- test controls ----------------------------------------------------------------------
  reset(): void {
    this.sessions.clear();
    ENTITIES.forEach((e) => this.docs.set(e, []));
    this.nextDocEntry = 1;
    this.failNextCount = 0;
    this.saveThenFailCount = 0;
    this.unknownItems.clear();
    this.createAttempts = 0;
    this.loginCount = 0;
  }
  /** The next n document requests fail with `status` (ERP down / overloaded). */
  failNext(n: number, status = 503): void {
    this.failNextCount = n;
    this.failStatus = status;
  }
  /** The next n creates are saved, but the client gets a 500: the classic "lost response". */
  saveThenFail(n: number): void {
    this.saveThenFailCount = n;
  }
  expireSessions(): void {
    this.sessions.clear();
  }
  markItemUnknown(itemCode: string): void {
    this.unknownItems.add(itemCode);
  }
  documents(entity?: Entity): ErpDocument[] {
    return entity ? [...this.docs.get(entity)!] : ENTITIES.flatMap((e) => this.docs.get(e)!);
  }

  // ---- HTTP -------------------------------------------------------------------------------
  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname.replace(/^\/b1s\/v1\/?/, '');
    const body = req.method === 'POST' ? await readJson(req) : undefined;

    if (req.method === 'POST' && path === 'Login') return this.login(body, res);

    const entity = ENTITIES.find((e) => e === path);
    if (!entity) return this.error(res, 404, -1, `Unknown resource ${path}`);
    if (!this.sessions.has(cookie(req, 'B1SESSION') ?? '')) return this.error(res, 401, 301, 'Invalid session or session already timeout.');

    if (this.failNextCount > 0) {
      this.failNextCount--;
      return this.error(res, this.failStatus, -1, 'Service temporarily unavailable');
    }

    if (req.method === 'GET') return this.query(entity, url, res);
    if (req.method === 'POST') return this.create(entity, body, res);
    return this.error(res, 405, -1, 'Method not allowed');
  }

  private login(body: any, res: ServerResponse): void {
    if (body?.UserName !== this.credentials.user || body?.Password !== this.credentials.password || !body?.CompanyDB) {
      return this.error(res, 401, 100000027, 'Fail to get DB Credentials from SLD');
    }
    this.loginCount++;
    const id = randomUUID();
    this.sessions.add(id);
    res.setHeader('Set-Cookie', `B1SESSION=${id}; HttpOnly; Path=/b1s/v1`);
    this.json(res, 200, { SessionId: id, Version: '1000000', SessionTimeout: 30 });
  }

  private query(entity: Entity, url: URL, res: ServerResponse): void {
    const match = /U_ExtRef eq '([^']+)'/.exec(url.searchParams.get('$filter') ?? '');
    const docs = this.docs.get(entity)!.filter((d) => !match || d.U_ExtRef === match[1]);
    this.json(res, 200, { value: docs.map((d) => ({ DocEntry: d.DocEntry })) });
  }

  private create(entity: Entity, body: any, res: ServerResponse): void {
    this.createAttempts++;
    const problem = this.validate(entity, body);
    if (problem) return this.error(res, 400, -5002, problem);

    const doc: ErpDocument = { ...body, DocEntry: this.nextDocEntry, DocNum: 1000 + this.nextDocEntry };
    this.nextDocEntry++;
    this.docs.get(entity)!.push(doc);

    if (this.saveThenFailCount > 0) {
      this.saveThenFailCount--;
      return this.error(res, 500, -1, 'Internal error after commit');
    }
    this.json(res, 201, doc);
  }

  private validate(entity: Entity, body: any): string | null {
    const lines: any[] = entity === 'StockTransfers' ? body?.StockTransferLines : body?.DocumentLines;
    if (!Array.isArray(lines) || lines.length === 0) return 'Document must have at least one line';
    if (entity === 'StockTransfers' && !(this.knownWarehouse(body.FromWarehouse) && this.knownWarehouse(body.ToWarehouse))) {
      return 'Invalid warehouse code';
    }
    for (const line of lines) {
      if (!MOCK_ERP_ITEMS.includes(line.ItemCode) || this.unknownItems.has(line.ItemCode)) return `Invalid item code '${line.ItemCode}'`;
      if (!(Number.isInteger(line.Quantity) && line.Quantity > 0)) return 'Quantity must be greater than zero';
      if (!this.knownWarehouse(line.WarehouseCode)) return `Invalid warehouse code '${line.WarehouseCode}'`;
    }
    return null;
  }

  private knownWarehouse(code: unknown): boolean {
    return MOCK_ERP_WAREHOUSES.includes(code as string);
  }

  private error(res: ServerResponse, status: number, code: number, value: string): void {
    this.json(res, status, { error: { code, message: { lang: 'en-us', value } } });
  }

  private json(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }
}

function cookie(req: IncomingMessage, name: string): string | undefined {
  return (req.headers.cookie ?? '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try {
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}
