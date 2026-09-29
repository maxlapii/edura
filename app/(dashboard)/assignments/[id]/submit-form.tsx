"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/client/api";
import { Alert, Button, Field, Textarea } from "@/components/ui";
import { useSubmit } from "../../_components/use-submit";

/** Student submission (POST /api/assignments/[id]/submit). Re-submitting replaces the previous work. */
export function SubmitForm({ assignmentId, initialContent, resubmit }: { assignmentId: string; initialContent?: string | null; resubmit?: boolean }) {
  const router = useRouter();
  const { busy, error, run } = useSubmit();
  const [content, setContent] = useState(initialContent ?? "");
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await apiFetch(`/api/assignments/${assignmentId}/submit`, { method: "POST", json: { content: content.trim() || null, attachments: [] } });
      setDone(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} data-testid="submission-form" className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {done && !error && <Alert tone="success">Your work has been submitted.</Alert>}
      <Field label={resubmit ? "Update your work" : "Your work"} htmlFor="content" hint="Paste or type your answer. You can resubmit until the assignment is graded.">
        <Textarea id="content" name="content" value={content} onChange={(e) => setContent(e.target.value)} maxLength={20000} rows={8} />
      </Field>
      <Button type="submit" disabled={busy} data-testid="submit">
        {busy ? "Submitting…" : resubmit ? "Resubmit" : "Submit assignment"}
      </Button>
    </form>
  );
}
