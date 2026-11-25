import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';
import { isRetryableStatus } from './erp-mapping';

export class ErpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
  get retryable(): boolean {
    return isRetryableStatus(this.status);
  }
}

/**
 * Minimal SAP Business One Service Layer client:
 * session login (B1SESSION cookie), automatic re-login when the session expires,
 * request timeout, and SAP's error format turned into ErpError.
 */
@Injectable()
export class ErpClient {
  private readonly logger = new Logger(ErpClient.name);
  private session: string | null = null;

  async findByExternalRef(entity: string, externalRef: string): Promise<number | null> {
    const filter = encodeURIComponent(`U_ExtRef eq '${externalRef}'`);
    const res = await this.request<{ value: { DocEntry: number }[] }>('GET', `/${entity}?$select=DocEntry&$filter=${filter}`);
    return res.value[0]?.DocEntry ?? null;
  }

  async create(entity: string, body: unknown): Promise<number> {
    const res = await this.request<{ DocEntry: number }>('POST', `/${entity}`, body);
    return res.DocEntry;
  }

  private async request<T>(method: string, path: string, body?: unknown, allowRelogin = true): Promise<T> {
    if (!this.session) await this.login();

    const res = await this.send(method, path, body, { Cookie: `B1SESSION=${this.session}` });
    if (res.status === 401 && allowRelogin) {
      this.logger.warn('ERP session expired, logging in again');
      this.session = null;
      return this.request<T>(method, path, body, false);
    }
    return this.parse<T>(res);
  }

  private async login(): Promise<void> {
    const res = await this.send('POST', '/Login', {
      CompanyDB: config.erp.companyDb,
      UserName: config.erp.user,
      Password: config.erp.password,
    });
    const json = await this.parse<{ SessionId: string }>(res);
    this.session = json.SessionId;
  }

  private async send(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
    try {
      return await fetch(config.erp.baseUrl + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(config.erp.timeoutMs),
      });
    } catch (e) {
      throw new ErpError(`ERP unreachable: ${(e as Error).message}`, 0);
    }
  }

  private async parse<T>(res: Response): Promise<T> {
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!res.ok) {
      // Service Layer error format: { "error": { "code": -5002, "message": { "lang": "en-us", "value": "..." } } }
      const detail = json?.error?.message?.value ?? (text || res.statusText);
      throw new ErpError(`ERP ${res.status}: ${detail}`, res.status);
    }
    return json as T;
  }
}
