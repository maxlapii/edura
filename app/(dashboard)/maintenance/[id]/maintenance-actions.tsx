"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Field, Select, Textarea } from "@/components/ui";
import { ActionButton } from "@/components/work/action-button";

export function AssignForm({ requestId, users, currentAssigneeId }: { requestId: string; users: Array<{ id: string; name: string; role: string }>; currentAssigneeId: string | null }) {
  const router = useRouter();
  const [assignedToUserId, setAssignedToUserId] = useState(currentAssigneeId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/maintenance/${requestId}/assign`, { method: "POST", json: { assignedToUserId } });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} data-testid="assign-form" className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Assign to" htmlFor="assignedToUserId">
        <Select id="assignedToUserId" name="assignedToUserId" required value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)}>
          <option value="">Select a staff member…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · {u.role.replace(/_/g, " ").toLowerCase()}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" disabled={busy || !assignedToUserId} data-testid="submit">
        {busy ? "Assigning…" : currentAssigneeId ? "Reassign" : "Assign"}
      </Button>
    </form>
  );
}

const LABELS: Record<string, string> = { OPEN: "Reopen", ASSIGNED: "Back to assigned", IN_PROGRESS: "Start work", RESOLVED: "Mark resolved", CLOSED: "Close" };

/** Status transition buttons; `targets` comes from the server via canTransition. */
export function StatusButtons({ requestId, targets }: { requestId: string; targets: string[] }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canResolve = targets.includes("RESOLVED");

  async function resolve(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/maintenance/${requestId}/status`, { method: "POST", json: { status: "RESOLVED", resolutionNote: note || null } });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (targets.length === 0) return <p className="text-sm text-slate-500">This request is closed.</p>;
  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {targets
          .filter((t) => t !== "RESOLVED")
          .map((t) => (
            <ActionButton key={t} method="POST" path={`/api/maintenance/${requestId}/status`} json={{ status: t }} label={LABELS[t] ?? t} variant={t === "CLOSED" ? "secondary" : "outline"} testId={`status-${t}`} />
          ))}
      </div>
      {canResolve && (
        <form onSubmit={resolve} data-testid="resolve-form" className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
          <Field label="Resolution note" htmlFor="resolutionNote">
            <Textarea id="resolutionNote" name="resolutionNote" className="min-h-[72px] bg-white" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done to fix it?" />
          </Field>
          <Button type="submit" disabled={busy} data-testid="status-RESOLVED">
            {busy ? "Saving…" : "Mark resolved"}
          </Button>
        </form>
      )}
    </div>
  );
}
