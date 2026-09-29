import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isAppError } from "@/lib/utils/errors";
import { Alert } from "@/components/ui";

/**
 * Maps an AppError thrown by a service into UI: NOT_FOUND → the 404 page,
 * FORBIDDEN/BAD_REQUEST/VALIDATION → an inline error alert. Anything else is rethrown
 * so the error boundary handles it.
 */
export function ServiceError({ error }: { error: unknown }): ReactNode {
  if (isAppError(error)) {
    if (error.code === "NOT_FOUND") notFound();
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED" || error.code === "BAD_REQUEST" || error.code === "VALIDATION_ERROR" || error.code === "CONFLICT") {
      return <Alert tone="error">{error.message}</Alert>;
    }
  }
  throw error;
}

/** Runs a service call and returns either its value or `null` when access is denied (used for optional sections). */
export async function optional<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (isAppError(err) && (err.code === "FORBIDDEN" || err.code === "NOT_FOUND")) return null;
    throw err;
  }
}
