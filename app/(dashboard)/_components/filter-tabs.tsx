import Link from "next/link";
import { cn } from "@/lib/utils";

/** Pill-style filter links (`?key=value`). Exact-match active state. */
export function FilterTabs({ items, current, hrefFor }: { items: Array<{ value: string; label: string; count?: number }>; current: string; hrefFor: (value: string) => string }) {
  return (
    <nav className="scrollbar-none mb-5 inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-white p-1 shadow-card" aria-label="Filters">
      {items.map((it) => {
        const active = it.value === current;
        return (
          <Link key={it.value} href={hrefFor(it.value)} aria-current={active ? "page" : undefined} className={cn("inline-flex items-center whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition", active ? "bg-ink text-white" : "text-slate-600 hover:bg-slate-100 hover:text-ink")}>
            {it.label}
            {it.count !== undefined && <span className={cn("ml-1.5 rounded-md px-1.5 text-[11px] tabular-nums", active ? "bg-white/20 text-white" : "bg-brand-50 text-brand-600")}>{it.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
