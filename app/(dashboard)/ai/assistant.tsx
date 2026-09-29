"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Badge, Button, Card, Field, Select, Textarea } from "@/components/ui";

interface ToolCall {
  name: string;
  input: unknown;
  ok: boolean;
}

interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

interface StudentOption {
  id: string;
  name: string;
  className: string | null;
}

const TEACHER_PROMPTS = ["Summarize my pending tasks", "What is my schedule today?"];
const ADMIN_PROMPTS = ["Which teachers are absent today?", "Which classes have repeated attendance problems?", "What maintenance requests are overdue?", "Summarize teacher workload"];

export function Assistant({ configured, model, tools, isAdmin, students }: { configured: boolean; model: string; tools: string[]; isAdmin: boolean; students: StudentOption[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <ChatPanel configured={configured} model={model} tools={tools} isAdmin={isAdmin} />
      </div>
      <div className="space-y-6">
        <ParentMessageDraft configured={configured} students={students} />
        <RewritePanel configured={configured} />
      </div>
    </div>
  );
}

// ───────────── Chat ─────────────

function ChatPanel({ configured, model, tools, isAdmin }: { configured: boolean; model: string; tools: string[]; isAdmin: boolean }) {
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy || !configured) return;
    const next: ChatEntry[] = [...history, { role: "user", content }];
    setHistory(next);
    setMessage("");
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ reply: string; toolCalls: ToolCall[]; model: string }>("/api/ai/chat", {
        method: "POST",
        json: { messages: next.map((m) => ({ role: m.role, content: m.content })) },
      });
      setHistory([...next, { role: "assistant", content: result.reply, toolCalls: result.toolCalls }]);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    } catch (err) {
      setError(errorMessage(err));
      setHistory(history);
      setMessage(content);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(message);
  }

  const prompts = isAdmin ? [...ADMIN_PROMPTS, ...TEACHER_PROMPTS] : TEACHER_PROMPTS;

  return (
    <Card
      title="Chat"
      description={`Answers marked with tool badges come from Edura records; everything else is a suggestion. Model: ${model}`}
      actions={
        history.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setHistory([])} disabled={busy}>
            Clear
          </Button>
        ) : undefined
      }
    >
      <div ref={listRef} className="mb-4 max-h-[28rem] space-y-3 overflow-y-auto" data-testid="chat-history">
        {history.length === 0 && (
          <p className="text-sm text-slate-500">
            Ask about your schedule, pending grading, attendance or tasks. The assistant can read data through {tools.length} approved tools and never changes records.
          </p>
        )}
        {history.map((entry, i) => (
          <div key={i} className={entry.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={entry.role === "user" ? "max-w-[85%] rounded-lg bg-brand-600 px-3 py-2 text-sm text-white" : "max-w-[85%] rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900"}>
              <p className="whitespace-pre-wrap">{entry.content}</p>
              {entry.toolCalls && entry.toolCalls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1" aria-label="Data sources">
                  {entry.toolCalls.map((t, j) => (
                    <Badge key={j} tone={t.ok ? "blue" : "red"}>
                      {t.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="text-xs text-slate-500">Thinking…</p>}
      </div>
      {error && (
        <div className="mb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="mb-3 flex flex-wrap gap-2">
        {prompts.map((p) => (
          <Button key={p} variant="outline" size="sm" onClick={() => void send(p)} disabled={busy || !configured}>
            {p}
          </Button>
        ))}
      </div>
      <form onSubmit={onSubmit} className="space-y-2" aria-label="Ask the assistant">
        <Textarea
          name="message"
          placeholder={configured ? "Ask a question…" : "The assistant is not configured"}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={busy || !configured}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(message);
            }
          }}
          className="min-h-[72px]"
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={busy || !configured || !message.trim()}>
            {busy ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ───────────── Copy button ─────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={copy}>
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

// ───────────── Parent message draft ─────────────

function ParentMessageDraft({ configured, students }: { configured: boolean; students: StudentOption[] }) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [purpose, setPurpose] = useState("");
  const [tone, setTone] = useState<"friendly" | "formal" | "concerned" | "encouraging">("friendly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!studentId || !purpose.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ subject: string; body: string }>("/api/ai/parent-message", { method: "POST", json: { studentId, purpose: purpose.trim(), tone } });
      setDraft(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Draft parent message" description="Generates a draft you can edit; nothing is sent.">
      {students.length === 0 ? (
        <p className="text-sm text-slate-500">No students available for messaging.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3" aria-label="Draft parent message">
          <Field label="Student" htmlFor="pm-student" required>
            <Select id="pm-student" name="studentId" value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={busy}>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.className ? ` — ${s.className}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Purpose" htmlFor="pm-purpose" required hint="What should the message achieve?">
            <Textarea id="pm-purpose" name="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} disabled={busy} className="min-h-[72px]" placeholder="e.g. Invite the parents to discuss recent late arrivals" />
          </Field>
          <Field label="Tone" htmlFor="pm-tone">
            <Select id="pm-tone" name="tone" value={tone} onChange={(e) => setTone(e.target.value as typeof tone)} disabled={busy}>
              <option value="friendly">Friendly</option>
              <option value="formal">Formal</option>
              <option value="concerned">Concerned</option>
              <option value="encouraging">Encouraging</option>
            </Select>
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" disabled={busy || !configured || !purpose.trim()}>
            {busy ? "Drafting…" : "Draft message"}
          </Button>
        </form>
      )}
      {draft && (
        <div className="mt-4 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="parent-message-draft">
          <div className="flex items-center justify-between gap-2">
            <Badge tone="purple">AI draft</Badge>
            <CopyButton text={`${draft.subject}\n\n${draft.body}`} />
          </div>
          <p className="text-sm font-medium text-slate-900">{draft.subject}</p>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{draft.body}</p>
          <Link href={`/messages/new?studentId=${encodeURIComponent(studentId)}`} className="text-sm text-brand-700 hover:underline">
            Open in Messages →
          </Link>
        </div>
      )}
    </Card>
  );
}

// ───────────── Rewrite ─────────────

function RewritePanel({ configured }: { configured: boolean }) {
  const [text, setText] = useState("");
  const [instruction, setInstruction] = useState("Make it shorter and more formal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !instruction.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const out = await apiFetch<{ text: string }>("/api/ai/rewrite", { method: "POST", json: { text: text.trim(), instruction: instruction.trim() } });
      setResult(out.text);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Rewrite text" description="Polish an announcement, comment or message.">
      <form onSubmit={onSubmit} className="space-y-3" aria-label="Rewrite text">
        <Field label="Text" htmlFor="rw-text" required>
          <Textarea id="rw-text" name="text" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
        </Field>
        <Field label="Instruction" htmlFor="rw-instruction" required>
          <Textarea id="rw-instruction" name="instruction" value={instruction} onChange={(e) => setInstruction(e.target.value)} disabled={busy} className="min-h-[48px]" />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" disabled={busy || !configured || !text.trim()}>
          {busy ? "Rewriting…" : "Rewrite"}
        </Button>
      </form>
      {result && (
        <div className="mt-4 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="rewrite-result">
          <div className="flex items-center justify-between gap-2">
            <Badge tone="purple">AI draft</Badge>
            <CopyButton text={result} />
          </div>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{result}</p>
        </div>
      )}
    </Card>
  );
}
