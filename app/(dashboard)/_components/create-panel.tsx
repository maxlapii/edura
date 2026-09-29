"use client";
import { useState, type ReactNode } from "react";
import { ChevronUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Full-width card holding a "create" form behind a toggle. Keeps list pages' tables at full
 * width instead of squeezing them next to a side form.
 */
export function CreatePanel({ title, description, children, defaultOpen = false, className }: { title: string; description?: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cn("rounded-card bg-white shadow-card", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition", open ? "bg-slate-100 text-ink" : "bg-ink text-white")}>{open ? <ChevronUp className="h-4 w-4" /> : <Plus className="h-4 w-4" />}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-ink">{title}</span>
          {description && <span className="block truncate text-xs text-muted">{description}</span>}
        </span>
        <span className="hidden text-xs font-medium text-brand-600 sm:inline">{open ? "Close" : "Open form"}</span>
      </button>
      {open && <div className="border-t border-slate-100 px-5 pb-5 pt-4">{children}</div>}
    </section>
  );
}
