import { notFound } from "next/navigation";
import { isAppError } from "@/lib/utils/errors";

export type Loaded<T> = { data: T; error: null } | { data: null; error: string };

/**
 * Runs a service call inside a Server Component and maps AppError:
 * NOT_FOUND → notFound(); FORBIDDEN / VALIDATION_ERROR → returned as an error message to render in an Alert.
 */
export async function load<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { data: await fn(), error: null };
  } catch (err) {
    if (isAppError(err)) {
      if (err.code === "NOT_FOUND") notFound();
      if (err.code === "FORBIDDEN" || err.code === "VALIDATION_ERROR" || err.code === "CONFLICT") return { data: null, error: err.message };
    }
    throw err;
  }
}

/** Optional data: swallows FORBIDDEN and returns null (for secondary panels). */
export async function optional<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (isAppError(err) && (err.code === "FORBIDDEN" || err.code === "NOT_FOUND")) return null;
    throw err;
  }
}

export function param(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export type IdParams = Promise<{ id: string }>;
