"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { stashTemporaryPassword } from "./temporary-password";

export type Option = { value: string; label: string };

export type FieldType = "text" | "email" | "password" | "number" | "date" | "datetime-local" | "time" | "textarea" | "select" | "multiselect" | "checkbox" | "json" | "tags" | "hidden";

export interface FieldDef {
  /** Must equal the API field name. */
  name: string;
  label: string;
  type?: FieldType;
  options?: Option[];
  required?: boolean;
  placeholder?: string;
  hint?: string;
  /** Send `null` when left empty instead of omitting the field (clears the value on PATCH). */
  nullable?: boolean;
  min?: number;
  max?: number;
  step?: number | string;
  rows?: number;
  /** Tailwind span classes, e.g. "sm:col-span-2". */
  className?: string;
  /** Show an empty option for selects (default true when not required). */
  allowEmpty?: boolean;
  disabled?: boolean;
}

type Value = string | string[] | boolean;

export interface EntityFormProps {
  /** data-testid of the <form>. Convention: "<entity>-form". */
  testId: string;
  method?: "POST" | "PATCH" | "PUT";
  action: string;
  fields: FieldDef[];
  initial?: Record<string, unknown>;
  /** Fixed values merged into every request body. */
  extra?: Record<string, unknown>;
  /** Nest the field values under this key (e.g. `settings`). `extra` stays at the top level. */
  wrap?: string;
  submitLabel?: string;
  /** After success navigate here. `{id}` is replaced by the id found at `idPath` in the response. */
  redirectTo?: string;
  /** Dotted path to the created entity's id in the response (default "id"). */
  idPath?: string;
  successMessage?: string;
  /** Clear inputs after a successful POST. */
  resetOnSuccess?: boolean;
  columns?: 1 | 2 | 3;
  title?: string;
  description?: string;
  compact?: boolean;
  cancelHref?: string;
}

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), obj);
}

function toInitial(f: FieldDef, v: unknown): Value {
  const type = f.type ?? "text";
  if (type === "checkbox") return Boolean(v);
  if (type === "multiselect") return Array.isArray(v) ? v.map(String) : [];
  if (type === "tags") return Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : "";
  if (type === "json") return v === undefined || v === null ? "" : JSON.stringify(v, null, 2);
  if (v === undefined || v === null) return "";
  if (type === "date") return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  if (type === "datetime-local") {
    const d = v instanceof Date ? v : new Date(String(v));
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return String(v);
}

function buildBody(fields: FieldDef[], values: Record<string, Value>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    const type = f.type ?? "text";
    const raw = values[f.name];
    switch (type) {
      case "checkbox":
        body[f.name] = Boolean(raw);
        break;
      case "multiselect":
        body[f.name] = Array.isArray(raw) ? raw : [];
        break;
      case "tags":
        body[f.name] = String(raw ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "number": {
        const s = String(raw ?? "").trim();
        if (s === "") {
          if (f.nullable) body[f.name] = null;
        } else body[f.name] = Number(s);
        break;
      }
      case "json": {
        const s = String(raw ?? "").trim();
        if (s === "") {
          if (f.nullable) body[f.name] = null;
          break;
        }
        try {
          body[f.name] = JSON.parse(s);
        } catch {
          throw new Error(`${f.label} must be valid JSON`);
        }
        break;
      }
      case "datetime-local": {
        const s = String(raw ?? "").trim();
        if (s === "") {
          if (f.nullable) body[f.name] = null;
        } else body[f.name] = new Date(s).toISOString();
        break;
      }
      default: {
        const s = String(raw ?? "");
        if (s.trim() === "") {
          if (f.nullable) body[f.name] = null;
        } else body[f.name] = s;
      }
    }
  }
  return body;
}

export function EntityForm(props: EntityFormProps) {
  const { testId, method = "POST", action, fields, initial, extra, wrap, submitLabel, redirectTo, idPath = "id", successMessage, resetOnSuccess, columns = 2, title, description, compact, cancelHref } = props;
  const router = useRouter();
  const initialValues = () => Object.fromEntries(fields.map((f) => [f.name, toInitial(f, initial?.[f.name])])) as Record<string, Value>;
  const [values, setValues] = useState<Record<string, Value>>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set(name: string, v: Value) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setTempPassword(null);
    setLoading(true);
    try {
      const fieldValues = buildBody(fields, values);
      const body = { ...(wrap ? { [wrap]: fieldValues } : fieldValues), ...(extra ?? {}) };
      const data = await apiFetch<Record<string, unknown>>(action, { method, json: body });
      const pw = data && typeof data === "object" && typeof data.temporaryPassword === "string" ? data.temporaryPassword : null;
      const id = data ? getPath(data, idPath) : undefined;
      if (pw) {
        setTempPassword(pw);
        if (typeof id === "string") stashTemporaryPassword(id, pw);
      }
      if (redirectTo) {
        const target = redirectTo.replace("{id}", typeof id === "string" ? id : "");
        router.push(target);
        router.refresh();
        return;
      }
      setSuccess(successMessage ?? "Saved.");
      if (resetOnSuccess) setValues(initialValues());
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const grid = columns === 1 ? "grid-cols-1" : columns === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2";

  return (
    <form onSubmit={onSubmit} data-testid={testId} className={cn("space-y-4", compact && "space-y-3")} aria-label={title}>
      {title && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}
      {tempPassword && (
        <Alert tone="success" title="Temporary password">
          <p>
            Share this password with the user once. It will not be shown again: <code data-testid="temporary-password" className="rounded bg-white px-1.5 py-0.5 font-mono text-sm">{tempPassword}</code>
          </p>
        </Alert>
      )}
      <div className={cn("grid gap-4", grid)}>
        {fields.map((f) => {
          const type = f.type ?? "text";
          const id = `${testId}-${f.name}`;
          const v = values[f.name];
          if (type === "hidden") return <input key={f.name} type="hidden" name={f.name} value={String(v ?? "")} />;
          if (type === "checkbox") {
            return (
              <div key={f.name} className={cn("flex items-end pb-2", f.className)}>
                <Checkbox id={id} name={f.name} checked={Boolean(v)} onChange={(e) => set(f.name, e.target.checked)} label={f.label} disabled={f.disabled} />
              </div>
            );
          }
          let control: React.ReactNode;
          if (type === "textarea" || type === "json") {
            control = <Textarea id={id} name={f.name} value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder} required={f.required} rows={f.rows ?? (type === "json" ? 8 : 4)} className={cn(type === "json" && "font-mono text-xs")} disabled={f.disabled} />;
          } else if (type === "select") {
            const allowEmpty = f.allowEmpty ?? !f.required;
            control = (
              <Select id={id} name={f.name} value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} required={f.required} disabled={f.disabled}>
                {allowEmpty && <option value="">{f.placeholder ?? "—"}</option>}
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            );
          } else if (type === "multiselect") {
            const selected = Array.isArray(v) ? v : [];
            control = (
              <Select id={id} name={f.name} multiple value={selected} onChange={(e) => set(f.name, Array.from(e.target.selectedOptions).map((o) => o.value))} className="min-h-[120px]" disabled={f.disabled}>
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            );
          } else {
            control = <Input id={id} name={f.name} type={type === "tags" ? "text" : type} value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder} required={f.required} min={f.min} max={f.max} step={f.step} autoComplete={type === "password" ? "new-password" : undefined} disabled={f.disabled} />;
          }
          return (
            <Field key={f.name} label={f.label} htmlFor={id} required={f.required} hint={f.hint ?? (type === "multiselect" ? "Hold Ctrl/Cmd to select several" : type === "tags" ? "Comma separated" : undefined)} className={f.className}>
              {control}
            </Field>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" data-testid="submit" disabled={loading}>
          {loading ? "Saving…" : (submitLabel ?? "Save")}
        </Button>
        {cancelHref && (
          <a href={cancelHref} className="text-sm text-slate-600 hover:underline">
            Cancel
          </a>
        )}
      </div>
    </form>
  );
}
