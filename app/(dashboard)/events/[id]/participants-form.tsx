"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Field, Input, Select } from "@/components/ui";

export function AddParticipantsForm({ eventId, users, students }: {
  eventId: string;
  users: Array<{ id: string; name: string; role: string }>;
  students: Array<{ id: string; name: string; className: string | null }>;
}) {
  const router = useRouter();
  const [userIds, setUserIds] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [role, setRole] = useState("PARTICIPANT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/events/${eventId}/participants`, { method: "POST", json: { userIds, studentIds, role: role || "PARTICIPANT" } });
      setUserIds([]);
      setStudentIds([]);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} data-testid="participants-form" className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Staff" htmlFor="userIds" hint={`${userIds.length} selected`}>
          <Select id="userIds" name="userIds" multiple size={6} value={userIds} onChange={(e) => setUserIds(Array.from(e.target.selectedOptions, (o) => o.value))}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.role.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Students" htmlFor="studentIds" hint={`${studentIds.length} selected`}>
          <Select id="studentIds" name="studentIds" multiple size={6} value={studentIds} onChange={(e) => setStudentIds(Array.from(e.target.selectedOptions, (o) => o.value))}>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.className ? ` · ${s.className}` : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex items-end gap-2">
        <Field label="Role" htmlFor="role" className="w-48">
          <Input id="role" name="role" maxLength={40} value={role} onChange={(e) => setRole(e.target.value.toUpperCase())} />
        </Field>
        <Button type="submit" disabled={busy || userIds.length + studentIds.length === 0} data-testid="submit">
          {busy ? "Adding…" : "Add participants"}
        </Button>
      </div>
    </form>
  );
}
