import Link from "next/link";
import { cn } from "@/lib/utils";

type Child = { id: string; firstName: string; lastName: string; class?: { name: string } | null };

/** Parent view: pick one of the linked children (`?studentId=`). */
export function ChildSelector({ items, current, basePath, extraQuery = "" }: { items: Child[]; current: string | null; basePath: string; extraQuery?: string }) {
  if (items.length === 0) return <p className="text-sm text-slate-500">No children are linked to your account yet. Please contact the school office.</p>;
  return (
    <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Children">
      {items.map((c) => {
        const active = c.id === current;
        return (
          <Link key={c.id} href={`${basePath}?studentId=${c.id}${extraQuery}`} role="tab" aria-selected={active} className={cn("rounded-full border px-3 py-1 text-sm", active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-700 hover:bg-slate-50")}>
            {c.firstName} {c.lastName}
            {c.class && <span className="ml-1 text-xs text-slate-500">· {c.class.name}</span>}
          </Link>
        );
      })}
    </div>
  );
}
