"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, LogOut, Menu, UserRound } from "lucide-react";
import type { NavSection, QuickAction } from "@/lib/nav";
import { authClient } from "@/lib/auth/client";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MobileSidebar, Sidebar, isActiveHref } from "./sidebar";
import { NotificationBell } from "./notification-bell";
import { QuickSearch } from "./quick-search";
import { QuickCreate } from "./quick-create";
import { SyncPill } from "./sync-pill";

function Crumbs({ entries }: { entries: Array<{ href: string; label: string; section: string }> }) {
  const pathname = usePathname();
  const match = entries.filter((e) => isActiveHref(pathname, e.href)).sort((a, b) => b.href.length - a.href.length)[0];
  if (!match) return null;
  const rest = pathname.slice(match.href.length).split("/").filter(Boolean);
  const tail = rest.length ? (rest[0] === "new" ? "New" : rest.includes("edit") ? "Edit" : "Details") : null;
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-muted lg:text-sm">
      <span className="hidden shrink-0 sm:inline">{match.section}</span>
      <ChevronRight className="hidden h-3 w-3 shrink-0 sm:inline" aria-hidden />
      {tail ? (
        <>
          <Link href={match.href} className="min-w-0 truncate hover:text-ink">
            {match.label}
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
          <span className="min-w-0 truncate font-medium text-ink">{tail}</span>
        </>
      ) : (
        <span className="min-w-0 truncate font-medium text-ink">{match.label}</span>
      )}
    </nav>
  );
}

export function AppShell({ user, schoolName, sections, quickActions, unread, children }: { user: { name: string; email: string; role: string }; schoolName: string | null; sections: NavSection[]; quickActions: QuickAction[]; unread: number; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menu]);

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  const entries = sections.flatMap((s) => s.items.map((i) => ({ href: i.href, label: i.label, section: s.title })));
  const roleLabel = user.role.replace(/_/g, " ").toLowerCase();

  return (
    <div className="flex h-dvh gap-3 overflow-hidden p-2 sm:p-3">
      <div className="hidden h-full shrink-0 lg:block">
        <Sidebar sections={sections} unread={unread} schoolName={schoolName} />
      </div>
      <MobileSidebar sections={sections} unread={unread} schoolName={schoolName} open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 px-1 pb-2 pt-1 sm:gap-3 sm:px-3">
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink lg:hidden">{schoolName ?? "Edura"}</div>
            <Crumbs entries={entries} />
          </div>
          <QuickSearch entries={entries} />
          <SyncPill />
          <QuickCreate actions={quickActions} />
          <NotificationBell initialUnread={unread} />
          <div ref={menuRef} className="relative">
            <button type="button" onClick={() => setMenu((m) => !m)} className={cn("flex items-center rounded-full ring-2 ring-white transition", menu && "ring-brand-200")} aria-haspopup="menu" aria-expanded={menu} aria-label={`${user.name} account menu`}>
              <Avatar name={user.name} className="h-11 w-11 text-sm" />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-[20px] bg-white py-2 text-sm shadow-pop">
                <div className="flex items-center gap-3 border-b border-slate-100 px-4 pb-3 pt-1">
                  <Avatar name={user.name} />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">{user.name}</div>
                    <div className="truncate text-xs capitalize text-muted">{roleLabel}</div>
                    <div className="truncate text-xs text-muted">{user.email}</div>
                  </div>
                </div>
                <Link href="/profile" role="menuitem" className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-canvas" onClick={() => setMenu(false)}>
                  <UserRound className="h-4 w-4 text-muted" /> My profile
                </Link>
                <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-4 py-2 text-left text-slate-700 hover:bg-canvas" onClick={signOut}>
                  <LogOut className="h-4 w-4 text-muted" /> Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-1 pb-6 pt-2 sm:px-3">
          <div className="animate-fade-up">{children}</div>
        </main>
      </div>
    </div>
  );
}
