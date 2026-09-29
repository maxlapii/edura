"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Card, Field, Textarea } from "@/components/ui";

export function ReportCardActions({ card, canPublish, canPrincipalComment }: { card: { id: string; teacherComment: string | null; principalComment: string | null }; canPublish: boolean; canPrincipalComment: boolean }) {
  const router = useRouter();
  const [teacherComment, setTeacherComment] = useState(card.teacherComment ?? "");
  const [principalComment, setPrincipalComment] = useState(card.principalComment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/report-cards/${card.id}`, { method: "PATCH", json: { teacherComment, ...(canPrincipalComment ? { principalComment } : {}) } });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!confirm("Publish this report card? Parents and the student will be notified.")) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/report-cards/${card.id}/publish`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Edit comments">
      <form onSubmit={save} className="space-y-3" data-testid="report-card-form">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Homeroom teacher comment" htmlFor="teacherComment">
          <Textarea id="teacherComment" name="teacherComment" value={teacherComment} onChange={(e) => setTeacherComment(e.target.value)} />
        </Field>
        {canPrincipalComment && (
          <Field label="Principal comment" htmlFor="principalComment">
            <Textarea id="principalComment" name="principalComment" value={principalComment} onChange={(e) => setPrincipalComment(e.target.value)} />
          </Field>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy} data-testid="submit">
            Save comments
          </Button>
          {canPublish && (
            <Button type="button" variant="secondary" disabled={busy} onClick={publish} data-testid="publish">
              Publish
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
