import { notFound } from "next/navigation";
import { isAppError } from "@/lib/utils/errors";

export type Loaded<T> = { ok: true; data: T; error: null } | { ok: false; data: null; error: string };

/**
 * Runs a service call inside a Server Component. NOT_FOUND → `notFound()`,
 * any other AppError (FORBIDDEN, BAD_REQUEST, VALIDATION_ERROR, CONFLICT…) → returned as a message to render in an Alert.
 */
export async function guarded<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await fn(), error: null };
  } catch (err) {
    if (isAppError(err)) {
      if (err.code === "NOT_FOUND") notFound();
      return { ok: false, data: null, error: err.message };
    }
    throw err;
  }
}

/** Like `guarded` but swallows permission errors and returns a fallback (for optional side data). */
export async function optional<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isAppError(err) && (err.code === "FORBIDDEN" || err.code === "UNAUTHORIZED" || err.code === "NOT_FOUND")) return fallback;
    throw err;
  }
}

type Params = Record<string, string | string[] | undefined>;

export function str(params: Params, key: string): string | undefined {
  const v = params[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s : undefined;
}

export function int(params: Params, key: string, fallback: number): number {
  const s = str(params, key);
  const n = s ? Number.parseInt(s, 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function dateParam(params: Params, key: string): Date | undefined {
  const s = str(params, key);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return new Date(`${s}T00:00:00.000Z`);
}

/** Builds a query string, skipping empty values. */
export function qs(values: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
