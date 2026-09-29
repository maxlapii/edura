"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Field, Select } from "@/components/ui";

export function GenerateForm({ terms, classes }: { terms: Array<{ id: string; label: string }>; classes: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [termId, setTermId] = useState(terms[0]?.id ?? "");
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await apiFetch<{ created: number; refreshed: number; skipped: number }>("/api/report-cards/generate", { method: "POST", json: { termId, classId } });
      setResult(`${r.created} created, ${r.refreshed} refreshed, ${r.skipped} already published.`);
      router.push(`/admin/report-cards?termId=${termId}&classId=${classId}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3" data-testid="generate-report-cards-form">
      <Field label="Term" htmlFor="termId">
        <Select id="termId" name="termId" value={termId} onChange={(e) => setTermId(e.target.value)}>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Class" htmlFor="classId">
        <Select id="classId" name="classId" value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" disabled={busy || !termId || !classId} data-testid="submit">
        {busy ? "Generating…" : "Generate drafts"}
      </Button>
      {result && <Alert tone="success">{result}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
    </form>
  );
}
