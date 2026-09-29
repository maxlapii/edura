"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await apiFetch<{ unread: number }>("/api/notifications?unreadOnly=true");
        if (!cancelled) setUnread(res.unread);
      } catch {
        /* ignore */
      }
    };
    const id = setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      try {
        const res = await apiFetch<{ items: Item[]; unread: number }>("/api/notifications?unreadOnly=true");
        setItems(res.items.slice(0, 6));
        setUnread(res.unread);
      } catch {
        setItems([]);
      }
    }
  }

  async function markAll() {
    try {
      await apiFetch("/api/notifications/read-all", { method: "POST" });
      setItems([]);
      setUnread(0);
    } catch {
      /* ignore */
    }
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={toggle} className={cn("relative flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink shadow-card transition hover:bg-slate-50", open && "bg-slate-100")} aria-label={`Notifications (${unread} unread)`} aria-haspopup="dialog" aria-expanded={open}>
        <Bell className="h-5 w-5" strokeWidth={1.75} />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-[20px] bg-white shadow-pop" role="dialog" aria-label="Recent notifications">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-sm font-semibold text-slate-800">Notifications</span>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto scrollbar-thin">
            {items === null && <li className="px-3 py-6 text-center text-xs text-slate-500">Loading…</li>}
            {items?.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-500">You&apos;re all caught up.</li>}
            {items?.map((n) => (
              <li key={n.id}>
                <Link href={n.link ?? "/notifications"} onClick={() => setOpen(false)} className="block px-3 py-2.5 hover:bg-slate-50">
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-800">{n.title}</div>
                      {n.body && <div className="line-clamp-2 text-xs text-slate-500">{n.body}</div>}
                      <div className="mt-0.5 text-[11px] text-slate-400">{ago(n.createdAt)}</div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-3 py-2 text-center text-xs font-medium text-brand-700 hover:bg-slate-50">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
