"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Checkbox, Field, Input, Select } from "@/components/ui";

const TYPES = ["CLASSROOM", "LAB", "MEETING", "LIBRARY", "SPORTS", "OFFICE", "OTHER"] as const;

export interface RoomValues {
  id?: string;
  name: string;
  code: string;
  type: string;
  capacity: number | null;
  building: string | null;
  responsibleUserId: string | null;
  isActive: boolean;
}

export function RoomForm({ initial, users, onDone }: { initial?: RoomValues; users: Array<{ id: string; name: string }>; onDone?: () => void }) {
  const router = useRouter();
  const editing = !!initial?.id;
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [type, setType] = useState(initial?.type ?? "CLASSROOM");
  const [capacity, setCapacity] = useState(initial?.capacity?.toString() ?? "");
  const [building, setBuilding] = useState(initial?.building ?? "");
  const [responsibleUserId, setResponsibleUserId] = useState(initial?.responsibleUserId ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const json = { name, code, type, capacity: capacity ? Number(capacity) : null, building: building || null, responsibleUserId: responsibleUserId || null, isActive };
    try {
      if (editing) {
        await apiFetch(`/api/rooms/${initial!.id}`, { method: "PATCH", json });
        router.push(`/rooms/${initial!.id}`);
      } else {
        const created = await apiFetch<{ id: string }>("/api/rooms", { method: "POST", json });
        router.push(`/rooms/${created.id}`);
      }
      onDone?.();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} data-testid="room-form" className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name" htmlFor="room-name" required>
          <Input id="room-name" name="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Code" htmlFor="room-code" required hint="Unique within the school">
          <Input id="room-code" name="code" required maxLength={30} value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="Type" htmlFor="room-type">
          <Select id="room-type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Capacity" htmlFor="room-capacity">
          <Input id="room-capacity" name="capacity" type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </Field>
        <Field label="Building" htmlFor="room-building">
          <Input id="room-building" name="building" maxLength={120} value={building} onChange={(e) => setBuilding(e.target.value)} />
        </Field>
        <Field label="Responsible" htmlFor="room-responsible">
          <Select id="room-responsible" name="responsibleUserId" value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)}>
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {editing && <Checkbox name="isActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} label="Room is active (bookable)" />}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} data-testid="submit">
          {busy ? "Saving…" : editing ? "Save room" : "Create room"}
        </Button>
        {onDone && (
          <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** Collapsible "New room" panel for the rooms list. */
export function NewRoomPanel({ users }: { users: Array<{ id: string; name: string }> }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button onClick={() => setOpen(true)} data-testid="new-room">
        New room
      </Button>
    );
  return (
    <div className="w-full rounded-card bg-white p-4 shadow-card">
      <RoomForm users={users} onDone={() => setOpen(false)} />
    </div>
  );
}
