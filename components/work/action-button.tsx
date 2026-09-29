"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button } from "@/components/ui";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "outline";

/**
 * One-click JSON API call. After success it refreshes the page, or pushes to
 * `redirectTo` / `${redirectPrefix}${data.id}` when given.
 */
export function ActionButton({ method, path, json, label, busyLabel, confirmText, variant = "outline", size = "sm", redirectTo, redirectPrefix, testId, className }: {
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  json?: unknown;
  label: string;
  busyLabel?: string;
  confirmText?: string;
  variant?: Variant;
  size?: "sm" | "md";
  redirectTo?: string;
  redirectPrefix?: string;
  testId?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<{ id?: string } | undefined>(path, { method, json });
      if (redirectTo) router.push(redirectTo);
      else if (redirectPrefix && data?.id) router.push(`${redirectPrefix}${data.id}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={className}>
      <Button type="button" variant={variant} size={size} onClick={run} disabled={busy} data-testid={testId}>
        {busy ? (busyLabel ?? "Working…") : label}
      </Button>
      {error && (
        <span className="mt-2 block">
          <Alert tone="error">{error}</Alert>
        </span>
      )}
    </span>
  );
}
