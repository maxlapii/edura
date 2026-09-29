"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Kbd } from "@/components/ui";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icons";

/** Round search button that opens a command palette (also ⌘K / Ctrl+K). */
export function QuickSearch({ entries }: { entries: Array<{ href: string; label: string; section: string }> }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term ? entries.filter((e) => `${e.section} ${e.label}`.toLowerCase().includes(term)) : entries;
    return list.slice(0, 9);
  }, [entries, q]);

  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink shadow-card transition hover:bg-slate-50" aria-label="Search (⌘K)" title="Search (⌘K)">
        <Search className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
          <div className="w-full max-w-lg overflow-hidden rounded-[22px] bg-white shadow-pop" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
            <div className="flex items-center gap-3 border-b border-slate-100 px-4">
              <Search className="h-4 w-4 text-muted" aria-hidden />
              <input
                ref={inputRef}
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCursor((c) => Math.min(c + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCursor((c) => Math.max(c - 1, 0));
                  } else if (e.key === "Enter" && results[cursor]) {
                    e.preventDefault();
                    go(results[cursor].href);
                  }
                }}
                placeholder="Jump to a page…"
                aria-label="Search pages"
                className="h-14 flex-1 border-0 bg-transparent text-sm text-ink placeholder:text-slate-400 focus:ring-0"
              />
              <Kbd>Esc</Kbd>
            </div>
            <ul className="scrollbar-thin max-h-80 overflow-y-auto py-2" role="listbox">
              {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No matching pages.</li>}
              {results.map((r, i) => (
                <li key={r.href} role="option" aria-selected={i === cursor}>
                  <button type="button" onMouseEnter={() => setCursor(i)} onClick={() => go(r.href)} className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm", i === cursor ? "bg-brand-50 text-ink" : "text-slate-700")}>
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-canvas text-brand-600">
                      <NavIcon href={r.href} className="h-4 w-4" />
                    </span>
                    <span className="flex-1 truncate font-medium">{r.label}</span>
                    <span className="text-[11px] text-muted">{r.section}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
