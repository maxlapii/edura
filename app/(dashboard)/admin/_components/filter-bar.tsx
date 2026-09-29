import type { ReactNode } from "react";
import { Button, Input, Select } from "@/components/ui";

/** Plain GET form for server-side filtering (no client JS). */
export function FilterBar({ action, children, hidden }: { action: string; children: ReactNode; hidden?: Record<string, string | undefined> }) {
  return (
    <form method="get" action={action} className="mb-4 flex flex-wrap items-end gap-2">
      {hidden && Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      {children}
      <Button type="submit" variant="secondary" size="md">
        Apply
      </Button>
    </form>
  );
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
      {label}
      {children}
    </label>
  );
}

export function FilterInput(props: React.ComponentProps<"input">) {
  return <Input {...props} className="h-10 w-48" />;
}

export function FilterSelect({ options, empty = "All", ...props }: React.ComponentProps<"select"> & { options: Array<{ value: string; label: string }>; empty?: string | null }) {
  return (
    <Select {...props} className="h-10 w-48">
      {empty !== null && <option value="">{empty}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
