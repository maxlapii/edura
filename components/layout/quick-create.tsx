"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { QuickAction } from "@/lib/nav";

export function QuickCreate({ actions }: { actions: QuickAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  if (actions.length === 0) return null;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white shadow-card transition hover:bg-black" aria-haspopup="menu" aria-expanded={open} aria-label="Create new" title="Create new">
        <Plus className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-[20px] bg-white py-2 shadow-pop">
          <div className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Create</div>
          {actions.map((a) => (
            <Link key={a.href + a.label} href={a.href} role="menuitem" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-slate-700 hover:bg-canvas hover:text-ink">
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
