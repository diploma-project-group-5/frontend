import { config } from '@/config';
import type { Conflict, ProblemCode } from './types';

/**
 * Помилка API у форматі application/problem+json (розділ 07):
 * type, title, status, detail, code, conflicts[].
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ProblemCode | undefined;
  readonly title: string;
  readonly detail: string | undefined;
  readonly conflicts: Conflict[];
  readonly body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    const title = typeof body.title === 'string' ? body.title : `HTTP ${status}`;
    super(title);
    this.name = 'ApiError';
    this.status = status;
    this.title = title;
    this.code = typeof body.code === 'string' ? (body.code as ProblemCode) : undefined;
    this.detail = typeof body.detail === 'string' ? body.detail : undefined;
    this.conflicts = Array.isArray(body.conflicts) ? (body.conflicts as Conflict[]) : [];
    this.body = body;
  }
}

export function isApiError(e: unknown, code?: ProblemCode): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}

type TokenProvider = () => Promise<string | undefined>;

let tokenProvider: TokenProvider = async () => undefined;

/** Кабінет підключає сюди keycloak (з оновленням токена перед кожним запитом). */
export function setTokenProvider(provider: TokenProvider) {
  tokenProvider = provider;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
  /** Публічні сторінки за QR ходять без JWT. */
  anonymous?: boolean;
  signal?: AbortSignal;
}

export interface ApiResponse<T> {
  status: number;
  data: T;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
  const url = new URL(config.apiBase + path, window.location.origin);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!opts.anonymous) {
    const token = await tokenProvider();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  });

  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { title: text };
    }
  }

  if (!res.ok) {
    const body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    throw new ApiError(res.status, body);
  }
  return { status: res.status, data: parsed as T };
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'GET' }).then((r) => r.data),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'POST', body }).then((r) => r.data),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PUT', body }).then((r) => r.data),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PATCH', body }).then((r) => r.data),
  delete: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'DELETE' }).then((r) => r.data),
};
