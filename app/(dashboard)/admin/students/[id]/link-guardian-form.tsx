"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Checkbox, Field, Input, Select } from "@/components/ui";

export function LinkGuardianForm({ studentId, guardians }: { studentId: string; guardians: Array<{ value: string; label: string }> }) {
  const router = useRouter();
  const [guardianId, setGuardianId] = useState("");
  const [relationship, setRelationship] = useState("PARENT");
  const [isPrimary, setIsPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch(`/api/guardians/${guardianId}/students`, { method: "POST", json: { studentId, relationship, isPrimary } });
      setGuardianId("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} data-testid="link-guardian-form" className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Guardian" htmlFor="link-guardianId" required>
        <Select id="link-guardianId" name="guardianId" value={guardianId} onChange={(e) => setGuardianId(e.target.value)} required>
          <option value="">Select a guardian…</option>
          {guardians.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Relationship" htmlFor="link-relationship">
        <Input id="link-relationship" name="relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="PARENT" />
      </Field>
      <Checkbox name="isPrimary" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} label="Primary contact" />
      <Button type="submit" data-testid="submit" disabled={loading || !guardianId}>
        {loading ? "Linking…" : "Link guardian"}
      </Button>
    </form>
  );
}
