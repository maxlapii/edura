"use client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button } from "@/components/ui";

export interface ActionButtonProps {
  action: string;
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  label: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  /** Ask for confirmation before running. */
  confirm?: string;
  /** Ask for a free-text value (window.prompt) and merge it into the body under this key. */
  promptField?: { key: string; label: string; required?: boolean };
  /** Navigate after success (otherwise the page is refreshed). */
  redirectTo?: string;
  testId?: string;
  successMessage?: string;
  /** Render the JSON result under the button (e.g. job results). */
  showResult?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
}

export function ActionButton({ action, method = "POST", body, label, variant = "outline", size = "sm", confirm: confirmText, promptField, redirectTo, testId, successMessage, showResult, disabled, className, title }: ActionButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  async function run() {
    if (confirmText && !window.confirm(confirmText)) return;
    let payload = body;
    if (promptField) {
      const answer = window.prompt(promptField.label, "");
      if (answer === null) return;
      if (promptField.required && !answer.trim()) return;
      payload = { ...((body as Record<string, unknown> | undefined) ?? {}), [promptField.key]: answer.trim() || null };
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await apiFetch<unknown>(action, { method, ...(payload !== undefined ? { json: payload } : {}) });
      if (showResult) setResult(data ?? null);
      if (successMessage) setMessage(successMessage);
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className={className ?? "inline-flex flex-col items-start gap-1"}>
      <Button type="button" variant={variant} size={size} onClick={run} disabled={disabled || loading} data-testid={testId} title={title}>
        {loading ? "…" : label}
      </Button>
      {error && (
        <span className="max-w-md">
          <Alert tone="error">{error}</Alert>
        </span>
      )}
      {message && (
        <span className="max-w-md">
          <Alert tone="success">{message}</Alert>
        </span>
      )}
      {showResult && result !== null && <pre className="max-h-80 w-full max-w-3xl overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(result, null, 2)}</pre>}
    </span>
  );
}
