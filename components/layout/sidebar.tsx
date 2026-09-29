"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import type { NavSection } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icons";

export function isActiveHref(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

// ───────────── Persisted UI preferences (localStorage, SSR-safe) ─────────────

const PREFS_KEY = "edura.sidebar.v2";
const PREFS_EVENT = "edura:sidebar-prefs";
interface Prefs {
  collapsed: boolean;
  /** Section title → expanded? Only sections the user toggled are stored. */
  sections: Record<string, boolean>;
}
const DEFAULT_PREFS: Prefs = { collapsed: false, sections: {} };
let cachedRaw: string | null | undefined;
let cachedPrefs: Prefs = DEFAULT_PREFS;

function readPrefs(): Prefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREFS_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedPrefs = raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS;
    } catch {
      cachedPrefs = DEFAULT_PREFS;
    }
  }
  return cachedPrefs;
}
function writePrefs(next: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(PREFS_EVENT));
}
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(PREFS_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(PREFS_EVENT, cb);
  };
}
export function useSidebarPrefs() {
  const prefs = useSyncExternalStore(subscribe, readPrefs, () => DEFAULT_PREFS);
  return {
    prefs,
    setCollapsed: (collapsed: boolean) => writePrefs({ ...readPrefs(), collapsed }),
    setSection: (title: string, open: boolean) => {
      const cur = readPrefs();
      writePrefs({ ...cur, sections: { ...cur.sections, [title]: open } });
    },
  };
}

// ───────────── Sidebar ─────────────

function Logo({ compact, schoolName }: { compact?: boolean; schoolName: string | null }) {
  return (
    <Link href="/dashboard" className={cn("flex items-center gap-3 rounded-xl", compact && "justify-center")} aria-label="Edura home">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.08]">
        <svg viewBox="0 0 32 32" className="h-6 w-6 text-white" fill="currentColor" aria-hidden>
          <circle cx="11" cy="21" r="5.5" />
          <circle cx="21.5" cy="10.5" r="4" />
          <circle cx="23" cy="22.5" r="2.6" />
        </svg>
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block font-display text-xl leading-none text-white">Edura</span>
          {schoolName && <span className="mt-1 block truncate text-[11px] text-white/50">{schoolName}</span>}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ sections, unread, schoolName, mode = "desktop", onNavigate }: { sections: NavSection[]; unread: number; schoolName: string | null; mode?: "desktop" | "drawer"; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { prefs, setCollapsed, setSection } = useSidebarPrefs();
  const collapsed = mode === "desktop" && prefs.collapsed;
  const navRef = useRef<HTMLElement>(null);

  // Keep the active item visible when the page changes.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "center" });
  }, [pathname, collapsed]);

  const isOpen = (s: NavSection) => {
    if (s.title === "Overview") return true;
    // Sub-menus are always visible by default; a group only folds when the user folds it,
    // and the group containing the current page is always shown.
    if (s.items.some((i) => isActiveHref(pathname, i.href))) return true;
    return prefs.sections[s.title] ?? true;
  };

  return (
    <aside className={cn("flex h-full flex-col rounded-[26px] bg-ink text-white transition-[width] duration-200", collapsed ? "w-[76px]" : "w-[264px]")} aria-label="Main navigation">
      <div className={cn("flex shrink-0 items-center gap-2 px-4 pb-3 pt-5", collapsed && "justify-center px-0")}>
        <div className="min-w-0 flex-1">
          <Logo compact={collapsed} schoolName={schoolName} />
        </div>
        {mode === "drawer" && (
          <button type="button" onClick={onNavigate} className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close navigation">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav ref={navRef} className="scrollbar-sidebar min-h-0 flex-1 overflow-y-auto px-3 py-2 [mask-image:linear-gradient(to_bottom,transparent,black_14px,black_calc(100%-14px),transparent)]">
        {sections.map((section, idx) => {
          const open = isOpen(section);
          const showGroup = section.group && section.group !== sections[idx - 1]?.group;
          const hasActive = section.items.some((i) => isActiveHref(pathname, i.href));
          return (
            <div key={section.title} className="mt-2 first:mt-0">
              {showGroup &&
                (collapsed ? (
                  <div className="mx-auto my-3 h-px w-8 bg-white/15" aria-hidden />
                ) : (
                  <div className="mb-1 mt-5 flex items-center gap-2 px-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">{section.group}</span>
                    <span className="h-px flex-1 bg-white/10" aria-hidden />
                  </div>
                ))}

              {!collapsed && section.title !== "Overview" && (
                <button
                  type="button"
                  onClick={() => setSection(section.title, !open)}
                  className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45 transition hover:text-white/80"
                  aria-expanded={open}
                >
                  <span className="flex-1 truncate">{section.title}</span>
                  {!open && hasActive && <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden />}
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} aria-hidden />
                </button>
              )}
              {collapsed && idx > 0 && !showGroup && <div className="mx-auto my-2 h-px w-6 bg-white/10" aria-hidden />}

              {(open || collapsed) && (
                <ul className={cn("space-y-0.5", !collapsed && section.title !== "Overview" && "mt-0.5")}>
                  {section.items.map((item) => {
                    const active = isActiveHref(pathname, item.href);
                    const badge = item.href === "/notifications" ? unread : 0;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          title={collapsed ? item.label : undefined}
                          aria-label={collapsed ? item.label : undefined}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "relative flex items-center gap-3 rounded-xl text-[13px] font-medium transition-colors",
                            collapsed ? "mx-auto h-11 w-11 justify-center" : "px-2.5 py-2",
                            active ? "bg-white text-ink shadow-sm" : "text-white/70 hover:bg-white/[0.08] hover:text-white",
                          )}
                        >
                          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", active ? "bg-brand-50 text-brand-600" : "bg-white/[0.06] text-white/70", collapsed && "bg-transparent")}>
                            <NavIcon href={item.href} className="h-4 w-4" />
                          </span>
                          {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                          {badge > 0 &&
                            (collapsed ? (
                              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-ink" aria-label={`${badge} unread`} />
                            ) : (
                              <span className={cn("rounded-full px-1.5 text-[10px] font-semibold tabular-nums", active ? "bg-brand-500 text-white" : "bg-brand-500 text-white")}>{badge > 99 ? "99+" : badge}</span>
                            ))}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {mode === "desktop" && (
        <div className={cn("shrink-0 border-t border-white/10 p-3", collapsed && "px-0")}>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className={cn("flex items-center gap-3 rounded-xl text-[13px] font-medium text-white/60 transition hover:bg-white/[0.08] hover:text-white", collapsed ? "mx-auto h-11 w-11 justify-center" : "w-full px-2.5 py-2")}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : undefined}
          >
            <span className="flex h-7 w-7 items-center justify-center">{collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}</span>
            {!collapsed && <span>Collapse sidebar</span>}
          </button>
        </div>
      )}
    </aside>
  );
}

/** Slide-in drawer for small screens, using the same sidebar in expanded form. */
export function MobileSidebar({ sections, unread, schoolName, open, onClose }: { sections: NavSection[]; unread: number; schoolName: string | null; open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div className="absolute inset-y-2 left-2 max-w-[calc(100vw-1rem)]">
        <Sidebar sections={sections} unread={unread} schoolName={schoolName} mode="drawer" onNavigate={onClose} />
      </div>
    </div>
  );
}
