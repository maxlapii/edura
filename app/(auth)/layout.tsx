import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

const BARS = [62, 88, 54, 72, 46, 80, 58, 70];

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <main className="flex min-h-dvh gap-3 p-2 sm:p-3">
      <section className="relative hidden w-[46%] max-w-[680px] flex-col justify-between overflow-hidden rounded-[28px] bg-ink p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 32 32" className="h-9 w-9" fill="currentColor" aria-hidden>
            <circle cx="11" cy="21" r="5.5" />
            <circle cx="21.5" cy="10.5" r="4" />
            <circle cx="23" cy="22.5" r="2.6" />
          </svg>
          <span className="font-display text-2xl">Edura</span>
        </div>

        <div className="space-y-4">
          <div className="surface-ocean rounded-[24px] p-6">
            <div className="flex items-center justify-between text-sm text-white/90">
              <span>Attendance this week</span>
              <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[11px]">↗ 1.2%</span>
            </div>
            <div className="mt-2 font-display text-4xl">96.4%</div>
            <div className="mt-6 flex h-32 items-end justify-between gap-3 px-1">
              {BARS.map((h, i) => (
                <span key={i} className={i === BARS.length - 1 ? "hatch-light w-full max-w-[26px] rounded-full border border-white/70" : "w-full max-w-[26px] rounded-full bg-white"} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[24px] bg-white p-5 text-ink">
              <div className="text-sm">Lessons covered</div>
              <div className="mt-1 font-display text-3xl">34/34</div>
              <div className="mt-3 flex h-5 gap-[3px]">
                {Array.from({ length: 22 }, (_, i) => (
                  <span key={i} className={`flex-1 rounded-[2px] ${i < 20 ? "bg-accent-500" : "bg-brand-500"}`} />
                ))}
              </div>
            </div>
            <div className="rounded-[24px] bg-white/[0.08] p-5">
              <div className="text-sm text-white/80">To grade</div>
              <div className="mt-1 font-display text-3xl">15</div>
              <div className="mt-2 text-xs text-white/60">3 assignments waiting</div>
            </div>
          </div>
        </div>

        <div>
          <h1 className="max-w-md font-display text-[34px] leading-tight">A lightweight platform teachers actually enjoy using.</h1>
          <p className="mt-2 max-w-md text-sm text-white/60">Timetables, attendance, grading, leave and cover — entered once and reused everywhere.</p>
        </div>
      </section>

      <section className="flex flex-1 items-center justify-center rounded-[28px] px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center justify-center gap-2 lg:hidden">
            <svg viewBox="0 0 32 32" className="h-8 w-8 text-ink" fill="currentColor" aria-hidden>
              <circle cx="11" cy="21" r="5.5" />
              <circle cx="21.5" cy="10.5" r="4" />
              <circle cx="23" cy="22.5" r="2.6" />
            </svg>
            <span className="font-display text-2xl text-ink">Edura</span>
          </div>
          <div className="rounded-[24px] bg-white p-7 shadow-card">{children}</div>
          <p className="mt-4 text-center text-xs text-muted">Need access? Contact your school administrator.</p>
        </div>
      </section>
    </main>
  );
}
