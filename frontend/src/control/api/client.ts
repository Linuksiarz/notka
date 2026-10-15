import { connection } from '../state/connection.svelte';
import { ui } from '../state/ui.svelte';
import type { ApiErrorBody } from '../../entity/api/types';

/**
 * A non-2xx API response, unwrapped from the `{ error: { code, key, message, params } }` envelope.
 *
 * `key` is the stable identifier the UI localizes; `message` is the server's English fallback.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly key: string | null,
    message: string,
    readonly params: Record<string, string> = {}
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /**
   * A failure that says nothing about the request itself — the server could not be reached, or it
   * failed on its side — so the same request may well succeed later.
   */
  get transient(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

/** `status` of an {@link ApiError} for a request that never got an answer. */
const UNREACHABLE = 0;

/** Set by the session store so a 401 anywhere can send the user back to the login screen. */
let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler;
}

type QueryValue = string | number | boolean | undefined | null;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Sent as it is, with its own type, instead of JSON — a picture's bytes. */
  raw?: Blob;
  query?: Record<string, QueryValue>;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/**
 * Performs an API call and returns the parsed body. `204 No Content` resolves to `undefined`.
 *
 * The active locale is sent as `Accept-Language` so server-side logs and any future
 * content-negotiated response match what the user sees.
 *
 * @throws {ApiError} for every non-2xx response, and when the server cannot be reached.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, raw, query } = options;

  const response = await send(buildUrl(`/api${path}`, query), {
    method,
    credentials: 'same-origin',
    headers: {
      'Accept-Language': ui.locale,
      ...(raw !== undefined
        ? { 'Content-Type': raw.type || 'application/octet-stream' }
        : body === undefined
          ? {}
          : { 'Content-Type': 'application/json' })
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body))
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload: unknown = text ? safeParse(text) : undefined;

  if (!response.ok) {
    const errorBody = payload as ApiErrorBody | undefined;
    const code = errorBody?.error?.code ?? 'INTERNAL_ERROR';
    const message = errorBody?.error?.message ?? `Request failed with status ${response.status}`;
    const key = errorBody?.error?.key ?? null;
    const params = errorBody?.error?.params ?? {};
    if (response.status === 401) unauthorizedHandler?.();
    throw new ApiError(response.status, code, key, message, params);
  }

  return payload as T;
}

/**
 * `fetch`, with a request that never got an answer turned into an {@link ApiError} like every other
 * failure — a stable key the UI can translate, instead of the browser's own "Failed to fetch".
 */
async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    const response = await fetch(url, init);
    connection.reachable = true;
    return response;
  } catch {
    connection.reachable = false;
    throw new ApiError(UNREACHABLE, 'UNREACHABLE', 'request.unreachable', 'The server cannot be reached');
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export const api = {
  get: <T>(path: string, query?: Record<string, QueryValue>) => apiRequest<T>(path, { query }),
  post: <T>(path: string, body?: unknown, query?: Record<string, QueryValue>) =>
    apiRequest<T>(path, { method: 'POST', body, query }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
  upload: <T>(path: string, raw: Blob) => apiRequest<T>(path, { method: 'POST', raw }),
  delete: <T>(path: string, query?: Record<string, QueryValue>) =>
    apiRequest<T>(path, { method: 'DELETE', query })
};
