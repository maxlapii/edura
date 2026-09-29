"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Field, Textarea } from "@/components/ui";

export function LeaveReviewForm({ leaveId }: { leaveId: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"APPROVE" | "REJECT" | null>(null);

  async function decide(action: "APPROVE" | "REJECT") {
    setError(null);
    setLoading(action);
    try {
      await apiFetch(`/api/leave/${leaveId}/review`, { method: "POST", json: { action, comment: comment.trim() || null } });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(null);
    }
  }

  return (
    <form data-testid="leave-review-form" onSubmit={(e) => e.preventDefault()} className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Comment" htmlFor="review-comment" hint="Shared with the teacher.">
        <Textarea id="review-comment" name="comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
      </Field>
      <div className="flex gap-2">
        <Button type="button" data-testid="approve" onClick={() => decide("APPROVE")} disabled={loading !== null}>
          {loading === "APPROVE" ? "Approving…" : "Approve"}
        </Button>
        <Button type="button" variant="danger" data-testid="reject" onClick={() => decide("REJECT")} disabled={loading !== null}>
          {loading === "REJECT" ? "Rejecting…" : "Reject"}
        </Button>
      </div>
      <p className="text-xs text-slate-500">Approving creates a substitution need for every affected lesson and notifies the teacher.</p>
    </form>
  );
}
