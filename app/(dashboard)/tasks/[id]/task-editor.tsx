"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { toDateInput } from "@/components/work/datetime";
import type { UserOption } from "../task-form";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const STATUSES = ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"] as const;

export function TaskEditor({ task, assignees, canDelete }: {
  task: { id: string; title: string; description: string | null; dueDate: Date | null; priority: string; status: string; assigneeUserId: string };
  assignees?: UserOption[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [dueDate, setDueDate] = useState(toDateInput(task.dueDate));
  const [priority, setPriority] = useState(task.priority);
  const [status, setStatus] = useState(task.status);
  const [assigneeUserId, setAssigneeUserId] = useState(task.assigneeUserId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        json: {
          title,
          description: description || null,
          dueDate: dueDate ? new Date(`${dueDate}T23:59:00`).toISOString() : null,
          priority,
          status,
          ...(assignees && assigneeUserId !== task.assigneeUserId ? { assigneeUserId } : {}),
        },
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!window.confirm("Delete this task? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      router.push("/tasks");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} data-testid="task-form" className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">Task saved.</Alert>}
      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Description" htmlFor="description">
        <Textarea id="description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Due date" htmlFor="dueDate">
          <Input id="dueDate" name="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Priority" htmlFor="priority">
          <Select id="priority" name="priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
              </option>
            ))}
          </Select>
        </Field>
        {assignees && (
          <Field label="Assignee" htmlFor="assigneeUserId">
            <Select id="assigneeUserId" name="assigneeUserId" value={assigneeUserId} onChange={(e) => setAssigneeUserId(e.target.value)}>
              {assignees.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <div className="flex items-center justify-between">
        <Button type="submit" disabled={busy} data-testid="submit">
          {busy ? "Saving…" : "Save changes"}
        </Button>
        {canDelete && (
          <Button type="button" variant="danger" onClick={onDelete} disabled={busy} data-testid="delete">
            Delete task
          </Button>
        )}
      </div>
    </form>
  );
}
