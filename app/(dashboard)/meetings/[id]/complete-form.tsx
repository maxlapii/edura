"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";

interface ActionItemRow {
  key: number;
  description: string;
  assigneeUserId: string;
  dueDate: string;
}

export function CompleteMeetingForm({ meetingId, participants, users }: {
  meetingId: string;
  participants: Array<{ userId: string; name: string; status: string }>;
  users: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [minutes, setMinutes] = useState("");
  const [decisions, setDecisions] = useState("");
  const [items, setItems] = useState<ActionItemRow[]>([]);
  const [attended, setAttended] = useState<string[]>(participants.filter((p) => p.status === "ACCEPTED" || p.status === "ATTENDED").map((p) => p.userId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addItem() {
    setItems((rows) => [...rows, { key: Date.now(), description: "", assigneeUserId: "", dueDate: "" }]);
  }
  function updateItem(key: number, patch: Partial<ActionItemRow>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeItem(key: number) {
    setItems((rows) => rows.filter((r) => r.key !== key));
  }
  function toggleAttended(userId: string, on: boolean) {
    setAttended((list) => (on ? [...new Set([...list, userId])] : list.filter((id) => id !== userId)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/meetings/${meetingId}/complete`, {
        method: "POST",
        json: {
          minutes: minutes || null,
          decisions: decisions || null,
          actionItems: items
            .filter((r) => r.description.trim())
            .map((r) => ({ description: r.description.trim(), assigneeUserId: r.assigneeUserId || null, dueDate: r.dueDate ? new Date(`${r.dueDate}T23:59:00`).toISOString() : null })),
          attendedUserIds: attended,
        },
      });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} data-testid="complete-form" className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Minutes" htmlFor="minutes">
        <Textarea id="minutes" name="minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="What was discussed…" />
      </Field>
      <Field label="Decisions" htmlFor="decisions">
        <Textarea id="decisions" name="decisions" value={decisions} onChange={(e) => setDecisions(e.target.value)} placeholder="What was decided…" />
      </Field>

      {participants.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-slate-700">Attendance</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {participants.map((p) => (
              <Checkbox key={p.userId} name="attendedUserIds" value={p.userId} label={p.name} checked={attended.includes(p.userId)} onChange={(e) => toggleAttended(p.userId, e.target.checked)} />
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="@container space-y-2">
        <legend className="text-sm font-medium text-slate-700">Action items</legend>
        <p className="text-xs text-slate-500">Each action item with an assignee becomes a task on that person&apos;s list.</p>
        {items.map((row, i) => (
          <div key={row.key} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 p-2 @xl:grid-cols-[1fr_200px_150px_auto]" data-testid="action-item">
            <Input name={`actionItems.${i}.description`} placeholder="Description" value={row.description} onChange={(e) => updateItem(row.key, { description: e.target.value })} required />
            <Select name={`actionItems.${i}.assigneeUserId`} value={row.assigneeUserId} onChange={(e) => updateItem(row.key, { assigneeUserId: e.target.value })}>
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
            <Input name={`actionItems.${i}.dueDate`} type="date" value={row.dueDate} onChange={(e) => updateItem(row.key, { dueDate: e.target.value })} />
            <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(row.key)}>
              Remove
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addItem} data-testid="add-action-item">
          + Add action item
        </Button>
      </fieldset>

      <Button type="submit" disabled={busy} data-testid="submit">
        {busy ? "Completing…" : "Complete meeting"}
      </Button>
    </form>
  );
}
