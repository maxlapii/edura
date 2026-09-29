import type { ReactNode } from "react";

export function JsonView({ value, className }: { value: unknown; className?: string }) {
  return <pre className={`max-h-80 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100 ${className ?? ""}`}>{JSON.stringify(value, null, 2)}</pre>;
}

export function JsonDetails({ summary, value }: { summary: ReactNode; value: unknown }) {
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-brand-700 hover:underline">{summary}</summary>
      <JsonView value={value} className="mt-1 max-w-xl" />
    </details>
  );
}
