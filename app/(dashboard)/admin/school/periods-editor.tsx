"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Input, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export interface PeriodRow {
  id: string;
  name: string;
  order: number;
  startTime: string;
  endTime: string;
}

type Draft = { name: string; order: string; startTime: string; endTime: string };

function toBody(d: Draft) {
  return { name: d.name, order: Number(d.order), startTime: d.startTime, endTime: d.endTime };
}

export function PeriodsEditor({ periods }: { periods: PeriodRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", order: String(periods.length + 1), startTime: "", endTime: "" });
  const [edit, setEdit] = useState<Draft>({ name: "", order: "", startTime: "", endTime: "" });

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      router.refresh();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const ok = await run("add", () => apiFetch("/api/periods", { method: "POST", json: toBody(draft) }));
    if (ok) setDraft({ name: "", order: String(Number(draft.order) + 1), startTime: "", endTime: "" });
  }

  async function save(e: FormEvent, id: string) {
    e.preventDefault();
    const ok = await run(id, () => apiFetch(`/api/periods/${id}`, { method: "PATCH", json: toBody(edit) }));
    if (ok) setEditing(null);
  }

  function startEdit(p: PeriodRow) {
    setEditing(p.id);
    setEdit({ name: p.name, order: String(p.order), startTime: p.startTime, endTime: p.endTime });
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <Table>
        <THead>
          <TR>
            <TH>#</TH>
            <TH>Name</TH>
            <TH>Start</TH>
            <TH>End</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {periods.map((p) =>
            editing === p.id ? (
              <TR key={p.id} data-testid="row" data-id={p.id}>
                <TD colSpan={5}>
                  <form onSubmit={(e) => save(e, p.id)} data-testid="period-edit-form" className="flex flex-wrap items-end gap-2">
                    <Input name="order" type="number" min={1} max={30} className="w-20" value={edit.order} onChange={(e) => setEdit({ ...edit, order: e.target.value })} required aria-label="Order" />
                    <Input name="name" className="w-40" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required aria-label="Name" />
                    <Input name="startTime" type="time" className="w-32" value={edit.startTime} onChange={(e) => setEdit({ ...edit, startTime: e.target.value })} required aria-label="Start time" />
                    <Input name="endTime" type="time" className="w-32" value={edit.endTime} onChange={(e) => setEdit({ ...edit, endTime: e.target.value })} required aria-label="End time" />
                    <Button type="submit" size="sm" data-testid="submit" disabled={busy === p.id}>
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </form>
                </TD>
              </TR>
            ) : (
              <TR key={p.id} data-testid="row" data-id={p.id}>
                <TD>{p.order}</TD>
                <TD className="font-medium">{p.name}</TD>
                <TD>{p.startTime}</TD>
                <TD>{p.endTime}</TD>
                <TD className="text-right">
                  <span className="inline-flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => startEdit(p)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy === p.id}
                      onClick={() => {
                        if (window.confirm(`Delete ${p.name}?`)) void run(p.id, () => apiFetch(`/api/periods/${p.id}`, { method: "DELETE" }));
                      }}
                    >
                      Delete
                    </Button>
                  </span>
                </TD>
              </TR>
            ),
          )}
          {periods.length === 0 && (
            <TR>
              <TD colSpan={5} className="text-center text-slate-500">
                No periods defined yet.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
      <form onSubmit={add} data-testid="period-form" className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-slate-300 p-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Order
          <Input name="order" type="number" min={1} max={30} className="w-20" value={draft.order} onChange={(e) => setDraft({ ...draft, order: e.target.value })} required />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Name
          <Input name="name" className="w-40" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Period 9" required />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Start
          <Input name="startTime" type="time" className="w-32" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} required />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          End
          <Input name="endTime" type="time" className="w-32" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} required />
        </label>
        <Button type="submit" size="md" data-testid="submit" disabled={busy === "add"}>
          Add period
        </Button>
      </form>
    </div>
  );
}
