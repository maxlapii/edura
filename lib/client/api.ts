"use client";

export class ApiClientError extends Error {
  status: number;
  code: string;
  details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Minimal JSON client for Route Handlers. Throws ApiClientError on non-2xx. */
export async function apiFetch<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(path, {
    credentials: "same-origin",
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let payload: { data?: T; error?: { code: string; message: string; details?: unknown } } = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (!res.ok) {
    const err = payload.error;
    throw new ApiClientError(res.status, err?.code ?? "ERROR", err?.message ?? res.statusText, err?.details);
  }
  return payload.data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (Array.isArray(err.details) && err.details.length && typeof err.details[0] === "object" && err.details[0] && "message" in err.details[0]) {
      return `${err.message}: ${(err.details as Array<{ path?: unknown[]; message: string }>).map((d) => `${Array.isArray(d.path) && d.path.length ? d.path.join(".") + " – " : ""}${d.message}`).join("; ")}`;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
