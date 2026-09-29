"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Button } from "@/components/ui";

export function MarkReadButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="shrink-0 text-right">
      <Button variant="ghost" size="sm" onClick={onClick} disabled={busy} data-testid="mark-read">
        Mark read
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function MarkAllReadButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/notifications/read-all", { method: "POST" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <Button variant="outline" size="sm" onClick={onClick} disabled={busy} data-testid="mark-all-read">
        Mark all read
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
