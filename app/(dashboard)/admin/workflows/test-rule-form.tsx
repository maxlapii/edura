"use client";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Field, Textarea } from "@/components/ui";

export function TestRuleForm({ ruleId, samplePayload }: { ruleId: string; samplePayload: string }) {
  const [text, setText] = useState(samplePayload);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    let payload: unknown;
    try {
      payload = text.trim() ? JSON.parse(text) : {};
    } catch {
      setError("Payload must be valid JSON");
      return;
    }
    setLoading(true);
    try {
      setResult(await apiFetch("/api/workflows/rules/" + ruleId + "/test", { method: "POST", json: { payload } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const r = result as { matched?: boolean } | null;
  return (
    <form onSubmit={onSubmit} data-testid="test-rule-form" className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Sample payload (JSON)" htmlFor="test-payload" hint="Nothing is executed – the rule is evaluated and actions are previewed.">
        <Textarea id="test-payload" name="payload" value={text} onChange={(e) => setText(e.target.value)} rows={8} className="font-mono text-xs" />
      </Field>
      <Button type="submit" variant="secondary" data-testid="submit" disabled={loading}>
        {loading ? "Testing…" : "Test rule"}
      </Button>
      {r && (
        <div className="space-y-2" data-testid="test-result">
          <Alert tone={r.matched ? "success" : "warning"}>{r.matched ? "Conditions matched – actions would run." : "Conditions did not match – nothing would run."}</Alert>
          <pre className="max-h-80 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </form>
  );
}
