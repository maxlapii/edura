"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Input } from "@/components/ui";

export interface EquipmentValues {
  id?: string;
  name: string;
  quantity: number;
  status: string;
  notes: string | null;
}

export function EquipmentForm({ roomId, initial, onDone }: { roomId: string; initial?: EquipmentValues; onDone?: () => void }) {
  const router = useRouter();
  const editing = !!initial?.id;
  const [name, setName] = useState(initial?.name ?? "");
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 1));
  const [status, setStatus] = useState(initial?.status ?? "OK");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const json = { name, roomId, quantity: Number(quantity) || 0, status: status || "OK", notes: notes || null };
    try {
      if (editing) await apiFetch(`/api/equipment/${initial!.id}`, { method: "PATCH", json });
      else await apiFetch("/api/equipment", { method: "POST", json });
      if (!editing) {
        setName("");
        setQuantity("1");
        setNotes("");
      }
      onDone?.();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} data-testid="equipment-form" className="@container space-y-2">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-2 @xl:grid-cols-[1fr_80px_100px_1fr_auto]">
        <Input name="name" required maxLength={120} placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        <Input name="quantity" type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-label="Quantity" />
        <Input name="status" maxLength={40} placeholder="OK" value={status} onChange={(e) => setStatus(e.target.value.toUpperCase())} aria-label="Status" />
        <Input name="notes" maxLength={2000} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Notes" />
        <span className="flex gap-1">
          <Button type="submit" size="sm" disabled={busy} data-testid="submit">
            {busy ? "…" : editing ? "Save" : "Add"}
          </Button>
          {onDone && (
            <Button type="button" size="sm" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          )}
        </span>
      </div>
    </form>
  );
}

export function EquipmentRow({ roomId, item, canManage }: { roomId: string; item: EquipmentValues & { id: string }; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Remove "${item.name}"?`)) return;
    try {
      await apiFetch(`/api/equipment/${item.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <li className="px-4 py-2 text-sm" data-testid="equipment" data-id={item.id}>
      {editing ? (
        <EquipmentForm roomId={roomId} initial={item} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-slate-900">{item.name}</span> <span className="text-xs text-slate-500">× {item.quantity}</span>
            <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${item.status === "OK" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{item.status}</span>
            {item.notes && <div className="text-xs text-slate-500">{item.notes}</div>}
            {error && <div className="text-xs text-red-600">{error}</div>}
          </div>
          {canManage && (
            <span className="flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-red-700" onClick={remove}>
                Remove
              </Button>
            </span>
          )}
        </div>
      )}
    </li>
  );
}
