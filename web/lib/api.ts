'use client';

/** Error from the API, with the stable `code` the backend returns (e.g. INSUFFICIENT_BALANCE). */
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

const TOKEN_KEY = 'erp-lab-token';

// The token lives in sessionStorage to keep the demo simple (cleared when the tab closes).
// A production app would prefer an httpOnly cookie set by the server.
export const tokenStore = {
  get: () => (typeof window === 'undefined' ? null : sessionStorage.getItem(TOKEN_KEY)),
  set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

export async function api<T>(path: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (res.status === 401 && token) {
    tokenStore.clear();
    window.location.assign('/login');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message ?? res.statusText;
    throw new ApiError(res.status, message, data?.code);
  }
  return data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
