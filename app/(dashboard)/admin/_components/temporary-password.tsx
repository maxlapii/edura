"use client";
import { useEffect, useSyncExternalStore } from "react";
import { Alert } from "@/components/ui";

const PREFIX = "edura:temporary-password:";
/** Passwords already read from storage for the lifetime of this page (so re-renders keep showing them). */
const shown = new Map<string, string>();

/** Keeps a freshly generated password in sessionStorage so the detail page can show it once after redirect. */
export function stashTemporaryPassword(entityId: string, password: string) {
  try {
    window.sessionStorage.setItem(PREFIX + entityId, password);
  } catch {
    /* storage unavailable – the create form still shows the password inline */
  }
}

function readStash(entityId: string): string | null {
  const cached = shown.get(entityId);
  if (cached) return cached;
  try {
    const v = window.sessionStorage.getItem(PREFIX + entityId);
    if (v) {
      shown.set(entityId, v);
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

const subscribe = () => () => {};

/** Shows (once) the temporary password stashed for this entity id and removes it from storage. */
export function TemporaryPasswordNotice({ entityId, password: explicit }: { entityId: string; password?: string | null }) {
  const stashed = useSyncExternalStore(
    subscribe,
    () => readStash(entityId),
    () => null,
  );
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(PREFIX + entityId);
    } catch {
      /* ignore */
    }
  }, [entityId, stashed]);
  const password = explicit || stashed;
  if (!password) return null;
  return (
    <Alert tone="success" title="Account created – temporary password">
      <p>
        Share this password with the user once. It will not be shown again:{" "}
        <code data-testid="temporary-password" className="rounded bg-white px-1.5 py-0.5 font-mono text-sm">
          {password}
        </code>
      </p>
    </Alert>
  );
}
