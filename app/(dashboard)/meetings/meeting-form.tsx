"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { fromLocalInput, toLocalInput } from "@/components/work/datetime";

const TYPES = ["STAFF", "DEPARTMENT", "PARENT", "TEACHER", "MANAGEMENT", "OTHER"] as const;

export interface MeetingFormValues {
  id?: string;
  title: string;
  type: string;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  roomId: string | null;
  location: string | null;
  agenda: string | null;
  participantUserIds: string[];
}

export function MeetingForm({ initial, rooms, users, currentUserId }: {
  initial?: MeetingFormValues;
  rooms: Array<{ id: string; name: string; code: string }>;
  users: Array<{ id: string; name: string; role: string }>;
  currentUserId: string;
}) {
  const router = useRouter();
  const editing = !!initial?.id;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState(initial?.type ?? "STAFF");
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.endsAt));
  const [roomId, setRoomId] = useState(initial?.roomId ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [agenda, setAgenda] = useState(initial?.agenda ?? "");
  const [participants, setParticipants] = useState<string[]>(initial?.participantUserIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const json = {
      title,
      type,
      startsAt: fromLocalInput(startsAt),
      endsAt: fromLocalInput(endsAt),
      roomId: roomId || null,
      location: location || null,
      agenda: agenda || null,
      participantUserIds: participants,
    };
    try {
      if (editing) {
        await apiFetch(`/api/meetings/${initial!.id}`, { method: "PATCH", json });
        router.push(`/meetings/${initial!.id}`);
      } else {
        const created = await apiFetch<{ id: string }>("/api/meetings", { method: "POST", json });
        router.push(`/meetings/${created.id}`);
      }
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} data-testid="meeting-form" className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Type" htmlFor="type">
          <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Starts" htmlFor="startsAt" required>
          <Input id="startsAt" name="startsAt" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field label="Ends" htmlFor="endsAt" required>
          <Input id="endsAt" name="endsAt" type="datetime-local" required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Room" htmlFor="roomId">
          <Select id="roomId" name="roomId" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">No room</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.code})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Location" htmlFor="location" hint="Used when no room is selected (e.g. online link).">
          <Input id="location" name="location" maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
      </div>
      <Field label="Agenda" htmlFor="agenda">
        <Textarea id="agenda" name="agenda" value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder="1. Welcome&#10;2. …" />
      </Field>
      <Field label="Participants" htmlFor="participantUserIds" hint={`${participants.length} selected · hold Ctrl/Cmd to select several`}>
        <Select id="participantUserIds" name="participantUserIds" multiple size={8} value={participants} onChange={(e) => setParticipants(Array.from(e.target.selectedOptions, (o) => o.value))}>
          {users
            .filter((u) => u.id !== currentUserId)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.role.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
        </Select>
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} data-testid="submit">
          {busy ? "Saving…" : editing ? "Save changes" : "Create meeting"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
