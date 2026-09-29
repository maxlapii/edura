"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/** "Last sync · Just now" pill from the reference; re-fetches the page's server data. */
export function SyncPill() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  return (
    <button
      type="button"
      onClick={() =>
        start(() => {
          router.refresh();
          setSyncedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
        })
      }
      className="hidden h-11 items-center gap-2.5 rounded-full bg-white pl-3 pr-4 text-left shadow-card transition hover:bg-slate-50 sm:flex"
      aria-label="Refresh data"
    >
      <RefreshCw className={cn("h-4 w-4 text-muted", pending && "animate-spin")} strokeWidth={1.8} />
      <span className="leading-tight">
        <span className="block text-[11px] text-ink">Last sync</span>
        <span className="block text-[11px] font-medium text-brand-600">{pending ? "Syncing…" : syncedAt ? `At ${syncedAt}` : "Just now"} ›</span>
      </span>
    </button>
  );
}
