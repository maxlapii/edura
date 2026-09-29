import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

// ───────────── Buttons ─────────────

type Variant = "primary" | "secondary" | "danger" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary: "bg-ink text-white shadow-sm hover:bg-black active:bg-black disabled:bg-slate-400",
  secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200",
  danger: "bg-rose-500 text-white shadow-sm hover:bg-rose-600 active:bg-rose-700",
  ghost: "text-slate-700 hover:bg-slate-100 active:bg-slate-200",
  outline: "border border-slate-200 bg-white text-ink hover:bg-slate-50 active:bg-slate-100",
};
const sizeClasses: Record<Size, string> = { sm: "h-8 px-3.5 text-xs", md: "h-10 px-5 text-sm", lg: "h-12 px-6 text-base" };

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors duration-150 select-none disabled:cursor-not-allowed disabled:opacity-60",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("h-4 w-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function Button({ variant = "primary", size = "md", className, type = "button", loading, children, disabled, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}

// ───────────── Small decorations ─────────────

/** The six-dot drag handle shown in card headers of the reference design. */
export function GripIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={cn("h-3 w-3 text-slate-400", className)} fill="currentColor" aria-hidden>
      {[2, 6, 10].flatMap((y) => [3, 9].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.15" />))}
    </svg>
  );
}

const deltaTones = {
  blue: "bg-brand-50 text-brand-600",
  mint: "bg-accent-50 text-accent-700",
  amber: "bg-amber-50 text-amber-700",
  rose: "bg-rose-50 text-rose-600",
  gray: "bg-slate-100 text-slate-600",
  dark: "bg-white/15 text-white",
};

/** Small rounded pill with an optional trend arrow: "↗ 0.3%". */
export function DeltaPill({ children, tone = "blue", trend, className }: { children: ReactNode; tone?: keyof typeof deltaTones; trend?: "up" | "down"; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums", deltaTones[tone], className)}>
      {trend && (
        <svg viewBox="0 0 12 12" className={cn("h-3 w-3", trend === "down" && "rotate-90")} fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 9.5 9.5 2.5M4.5 2.5h5v5" />
        </svg>
      )}
      {children}
    </span>
  );
}

/** Tick-style progress bar (vertical stripes) from the reference "Delivery Rate" card. */
export function StripedProgress({ value, tone = "mint", ticks = 48, className, label }: { value: number; tone?: "mint" | "blue" | "amber" | "rose"; ticks?: number; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const filled = Math.round((pct / 100) * ticks);
  const on = { mint: "bg-accent-500", blue: "bg-brand-500", amber: "bg-amber-400", rose: "bg-rose-400" }[tone];
  const edge = { mint: "bg-brand-500", blue: "bg-brand-700", amber: "bg-amber-600", rose: "bg-rose-600" }[tone];
  return (
    <div className={cn("flex h-7 items-stretch gap-[3px]", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      {Array.from({ length: ticks }, (_, i) => (
        <span key={i} className={cn("flex-1 rounded-[2px]", i < filled ? (i >= filled - 2 ? edge : on) : "bg-slate-200/80")} />
      ))}
    </div>
  );
}

// ───────────── Layout ─────────────

export function PageHeader({ title, description, actions, breadcrumb, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; breadcrumb?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {(breadcrumb || eyebrow) && <div className="mb-1 text-xs font-medium text-muted">{breadcrumb ?? eyebrow}</div>}
        <h1 className="truncate font-display text-[26px] leading-tight text-ink sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}

export function Card({ title, description, actions, children, className, padded = true, footer, grip = true }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean; footer?: ReactNode; grip?: boolean }) {
  return (
    <section className={cn("rounded-card bg-white shadow-card", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-medium text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : grip && <GripIcon className="mt-1.5" />}
        </header>
      )}
      <div className={cn(padded && (title || actions ? "px-5 pb-5" : "p-5"))}>{children}</div>
      {footer && <footer className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">{footer}</footer>}
    </section>
  );
}

const statTones = {
  default: { pill: "blue" as const, bar: "blue" as const, icon: "bg-brand-50 text-brand-600" },
  info: { pill: "blue" as const, bar: "blue" as const, icon: "bg-brand-50 text-brand-600" },
  good: { pill: "mint" as const, bar: "mint" as const, icon: "bg-accent-50 text-accent-700" },
  warn: { pill: "amber" as const, bar: "amber" as const, icon: "bg-amber-50 text-amber-700" },
  bad: { pill: "rose" as const, bar: "rose" as const, icon: "bg-rose-50 text-rose-600" },
};

export function StatCard({ label, value, hint, tone = "default", href, icon, progress, aside }: { label: string; value: ReactNode; hint?: ReactNode; tone?: keyof typeof statTones; href?: string; icon?: ReactNode; progress?: number; aside?: ReactNode }) {
  const t = statTones[tone];
  const body = (
    <div className={cn("flex h-full flex-col rounded-card bg-white p-5 shadow-card transition", href && "hover:-translate-y-0.5 hover:shadow-pop")}>
      <div className="flex items-center gap-2">
        {icon && <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg [&>svg]:h-3.5 [&>svg]:w-3.5", t.icon)}>{icon}</span>}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{label}</span>
        <GripIcon />
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[34px] leading-none tabular-nums text-ink">{value}</span>
          {hint && <DeltaPill tone={t.pill}>{hint}</DeltaPill>}
        </div>
        {aside && <span className="text-xs text-muted">{aside}</span>}
      </div>
      {progress !== undefined && <StripedProgress value={progress} tone={t.bar} className="mt-4" label={label} />}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-12 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand-500 shadow-card [&>svg]:h-5 [&>svg]:w-5">
        {icon ?? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0v10l-8 4m8-14l-8 4m0 10L4 17V7m8 4v10" />
          </svg>
        )}
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const alertTones = {
  info: "bg-brand-50 text-brand-900 [&_.alert-bar]:bg-brand-500",
  success: "bg-accent-50 text-accent-700 [&_.alert-bar]:bg-accent-500",
  warning: "bg-amber-50 text-amber-900 [&_.alert-bar]:bg-amber-400",
  error: "bg-rose-50 text-rose-900 [&_.alert-bar]:bg-rose-500",
};

export function Alert({ tone = "info", title, children }: { tone?: keyof typeof alertTones; title?: string; children?: ReactNode }) {
  return (
    <div role="alert" className={cn("relative overflow-hidden rounded-2xl px-4 py-3 pl-5 text-sm", alertTones[tone])}>
      <span className="alert-bar absolute inset-y-2.5 left-2 w-1 rounded-full" aria-hidden />
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-1")}>{children}</div>}
    </div>
  );
}

// ───────────── Badges ─────────────

type BadgeTone = "gray" | "green" | "amber" | "red" | "blue" | "purple";
const badgeTones: Record<BadgeTone, string> = {
  gray: "bg-slate-100 text-slate-600",
  green: "bg-accent-50 text-accent-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-rose-50 text-rose-600",
  blue: "bg-brand-50 text-brand-600",
  purple: "bg-violet-50 text-violet-700",
};
const dotTones: Record<BadgeTone, string> = { gray: "bg-slate-400", green: "bg-accent-500", amber: "bg-amber-400", red: "bg-rose-500", blue: "bg-brand-500", purple: "bg-violet-500" };

export function Badge({ tone = "gray", children, className, dot }: { tone?: BadgeTone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium", badgeTones[tone], className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotTones[tone])} aria-hidden />}
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, BadgeTone> = {
  ACTIVE: "green", PRESENT: "green", APPROVED: "green", DONE: "green", COMPLETED: "green", RESOLVED: "green", CLOSED: "gray", SUBMITTED: "blue", LOCKED: "purple", GRADED: "green", SCHEDULED: "blue", ASSIGNED: "blue", PUBLISHED: "green", READY: "blue", CONFIRMED: "green", ACCEPTED: "green", ATTENDED: "green",
  PENDING: "amber", OPEN: "amber", TODO: "amber", IN_PROGRESS: "blue", DRAFT: "gray", LATE: "amber", ON_LEAVE: "amber", FOLLOW_UP: "amber", PENDING_APPROVAL: "amber", INVITED: "gray", HIGH: "amber", MEDIUM: "gray", LOW: "gray", NORMAL: "gray",
  ABSENT: "red", REJECTED: "red", CANCELLED: "gray", DECLINED: "red", INACTIVE: "gray", SUSPENDED: "red", OVERLOADED: "red", URGENT: "red", MISSING: "red", EXCUSED: "gray", UNDERUTILIZED: "amber",
  A: "green", B: "green", C: "blue", D: "amber", F: "red",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge>—</Badge>;
  const tone = STATUS_TONES[status] ?? "gray";
  return (
    <Badge tone={tone} dot>
      {status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
    </Badge>
  );
}

// ───────────── Forms ─────────────

const inputBase =
  "block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-ink transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-slate-500";

// Single-line controls get a fixed height and no vertical padding so the browser centres the text,
// which keeps it from clipping when a page sets a custom height (h-9, h-10…).
const singleLine = "h-11 py-0";

export function Input({ className, ...props }: ComponentProps<"input">) {
  const isBox = props.type === "checkbox" || props.type === "radio" || props.type === "file";
  return <input className={cn(inputBase, !isBox && singleLine, className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(inputBase, props.multiple ? "py-2" : singleLine, "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 20 20%22><path stroke=%22%23222026%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%221.5%22 d=%22M6 8l4 4 4-4%22/></svg>')] bg-[length:1rem] bg-[right_0.65rem_center] bg-no-repeat pr-9", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputBase, "min-h-[96px] leading-relaxed", className)} {...props} />;
}

export function Checkbox({ className, label, ...props }: ComponentProps<"input"> & { label?: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" className={cn("h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500", className)} {...props} />
      {label}
    </label>
  );
}

export function Field({ label, htmlFor, hint, error, required, children, className }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: ReactNode; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

// ───────────── Tables ─────────────

export function Table({ children, className, dense }: { children: ReactNode; className?: string; dense?: boolean }) {
  return (
    <div className={cn("scrollbar-thin overflow-x-auto rounded-card bg-white shadow-card", className)}>
      <table className={cn("min-w-full text-sm", dense && "[&_td]:py-2 [&_th]:py-2")}>{children}</table>
    </div>
  );
}
export function THead({ children }: { children: ReactNode }) {
  return <thead className="text-left text-xs font-medium text-muted [&_th]:border-b [&_th]:border-slate-100">{children}</thead>;
}
export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}
export function TR({ children, className, ...props }: ComponentProps<"tr">) {
  return (
    <tr className={cn("transition-colors hover:bg-brand-50/40", className)} {...props}>
      {children}
    </tr>
  );
}
export function TH({ children, className, ...props }: ComponentProps<"th">) {
  return (
    <th scope="col" className={cn("whitespace-nowrap px-4 py-3.5 font-medium first:pl-5 last:pr-5", className)} {...props}>
      {children}
    </th>
  );
}
export function TD({ children, className, ...props }: ComponentProps<"td">) {
  // Short plain values (dates, codes, counts, names) never wrap; long text still can.
  const short = (typeof children === "string" || typeof children === "number") && String(children).length <= 28;
  return (
    <td className={cn("px-4 py-3 align-middle text-slate-700 first:pl-5 last:pr-5", short && "whitespace-nowrap", className)} {...props}>
      {children}
    </td>
  );
}

// ───────────── Tabs (link based) ─────────────

export function Tabs({ items, current }: { items: Array<{ href: string; label: string; count?: number }>; current: string }) {
  return (
    <nav className="scrollbar-none mb-5 inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-white p-1 shadow-card" aria-label="Tabs">
      {items.map((item) => {
        const active = current === item.href || current.startsWith(item.href + "/");
        return (
          <Link key={item.href} href={item.href} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition", active ? "bg-ink text-white" : "text-slate-600 hover:bg-slate-100 hover:text-ink")} aria-current={active ? "page" : undefined}>
            {item.label}
            {item.count !== undefined && <span className={cn("rounded-md px-1.5 text-[11px] tabular-nums", active ? "bg-white/20 text-white" : "bg-brand-50 text-brand-600")}>{item.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function DescriptionList({ items, columns = 2 }: { items: Array<{ label: ReactNode; value: ReactNode }>; columns?: 1 | 2 | 3 }) {
  return (
    <div className="@container">
      <dl className={cn("grid grid-cols-1 gap-3", columns === 2 && "@md:grid-cols-2", columns === 3 && "@md:grid-cols-2 @2xl:grid-cols-3")}>
        {items.map((it, i) => (
          <div key={i} className="min-w-0 rounded-2xl bg-canvas/70 px-4 py-3">
            <dt className="text-xs text-muted">{it.label}</dt>
            <dd className="mt-0.5 break-words text-sm font-medium text-ink">{it.value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Pagination({ page, totalPages, hrefFor }: { page: number; totalPages: number; hrefFor: (p: number) => string }) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted">
      <span className="tabular-nums">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link className={buttonClasses("outline", "sm")} href={hrefFor(page - 1)}>
            Previous
          </Link>
        )}
        {page < totalPages && (
          <Link className={buttonClasses("outline", "sm")} href={hrefFor(page + 1)}>
            Next
          </Link>
        )}
      </div>
    </div>
  );
}

const avatarPalette = ["bg-brand-100 text-brand-700", "bg-accent-100 text-accent-700", "bg-slate-200 text-ink", "bg-sky-100 text-sky-700", "bg-teal-100 text-teal-700", "bg-indigo-100 text-indigo-700"];

export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const palette = avatarPalette[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % avatarPalette.length];
  const sizes = { sm: "h-8 w-8 text-[11px]", md: "h-10 w-10 text-xs", lg: "h-14 w-14 text-base" };
  return <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", palette, sizes[size], className)}>{initials || "?"}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted">{children}</kbd>;
}

/** Colour-barred list row used for lessons, events and timelines. */
const barTones = ["bg-brand-500", "bg-accent-500", "bg-ink", "bg-brand-300", "bg-accent-300", "bg-slate-400"];
export function BarRow({ index = 0, meta, title, subtitle, action, href }: { index?: number; meta?: ReactNode; title: ReactNode; subtitle?: ReactNode; action?: ReactNode; href?: string }) {
  const content = (
    <>
      <span className={cn("h-full w-1 shrink-0 self-stretch rounded-full", barTones[index % barTones.length])} aria-hidden />
      <div className="min-w-0 flex-1">
        {meta && <div className="text-[11px] text-muted">{meta}</div>}
        <div className="truncate text-sm font-medium text-ink">{title}</div>
        {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
      </div>
      {action ?? (href && <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600">View</span>)}
    </>
  );
  const cls = "flex items-center gap-3 py-2.5";
  return href ? (
    <Link href={href} className={cn(cls, "group -mx-2 rounded-xl px-2 hover:bg-slate-50")}>
      {content}
    </Link>
  ) : (
    <div className={cls}>{content}</div>
  );
}

/** Round icon chip with a tinted background. */
const chipTones = ["bg-brand-50 text-brand-600", "bg-accent-50 text-accent-700", "bg-slate-100 text-ink", "bg-sky-50 text-sky-700"];
export function IconChip({ index = 0, children, className }: { index?: number; children: ReactNode; className?: string }) {
  return <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl [&>svg]:h-4 [&>svg]:w-4", chipTones[index % chipTones.length], className)}>{children}</span>;
}

/** Dot legend item: "● Direct  ↗ 0.3%". */
export function LegendRow({ color, label, value, hint }: { color: string; label: ReactNode; value?: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 text-sm">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-ink">{label}</span>
      {value !== undefined && <span className="tabular-nums text-ink">{value}</span>}
      {hint}
    </div>
  );
}
