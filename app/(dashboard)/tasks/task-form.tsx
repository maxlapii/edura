"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Field, Input, Select } from "@/components/ui";

export interface UserOption {
  id: string;
  name: string;
}

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

/** Quick-add task form. `assignees` is only passed when the caller may assign tasks to others. */
export function TaskForm({ assignees, currentUserId }: { assignees?: UserOption[]; currentUserId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("MEDIUM");
  const [assigneeUserId, setAssigneeUserId] = useState(currentUserId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/tasks", {
        method: "POST",
        json: {
          title,
          dueDate: dueDate ? new Date(`${dueDate}T23:59:00`).toISOString() : null,
          priority,
          ...(assignees && assigneeUserId !== currentUserId ? { assigneeUserId } : {}),
        },
      });
      setTitle("");
      setDueDate("");
      setPriority("MEDIUM");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} data-testid="task-form" className="@container space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-[1fr_auto_auto_auto_auto] @2xl:items-end">
        <Field label="New task" htmlFor="task-title" required>
          <Input id="task-title" name="title" required maxLength={200} placeholder="e.g. Grade Grade 10 essays" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Due" htmlFor="task-due">
          <Input id="task-due" name="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Priority" htmlFor="task-priority">
          <Select id="task-priority" name="priority" value={priority} onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        {assignees && (
          <Field label="Assign to" htmlFor="task-assignee">
            <Select id="task-assignee" name="assigneeUserId" value={assigneeUserId} onChange={(e) => setAssigneeUserId(e.target.value)}>
              <option value={currentUserId}>Me</option>
              {assignees
                .filter((u) => u.id !== currentUserId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        <Button type="submit" disabled={busy} data-testid="submit">
          {busy ? "Adding…" : "Add task"}
        </Button>
      </div>
    </form>
  );
}
