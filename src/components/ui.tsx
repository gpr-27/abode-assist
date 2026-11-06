import clsx from "clsx";
import type { ReactNode } from "react";

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "indigo" | "ok" | "warn" | "bad"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-paper-2 text-stone",
    indigo: "bg-indigo-soft text-indigo",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad",
  };
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between pb-6">
      <div>
        <h1 className="display text-3xl sm:text-[2.1rem] leading-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-stone max-w-2xl">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <p className="display text-xl">{title}</p>
      {children && <p className="mt-2 text-sm text-stone max-w-md mx-auto">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "bad"; children: ReactNode }) {
  const tones = { neutral: "bg-paper-2 text-ink", ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad" };
  return <div role={tone === "bad" ? "alert" : "status"} className={clsx("rounded-xl px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className="py-4">
      <p className="text-sm text-stone">{label}</p>
      <p className={clsx("display num text-3xl mt-1", tone === "ok" && "text-ok", tone === "warn" && "text-warn", tone === "bad" && "text-bad")}>{value}</p>
      {hint && <p className="text-xs text-stone mt-1">{hint}</p>}
    </div>
  );
}

/** Thin-line jaali lattice, after the stone screens of old Ahmedabad. Purely decorative. */
export function Jaali({ className }: { className?: string }) {
  const cells = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) cells.push([c * 40 + (r % 2 ? 20 : 0), r * 34]);
  return (
    <svg viewBox="0 0 220 220" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="0.7">
      <defs>
        <clipPath id="arch"><path d="M10 220V90C10 40 60 6 110 6s100 34 100 84v130z" /></clipPath>
      </defs>
      <path d="M10 220V90C10 40 60 6 110 6s100 34 100 84v130" strokeWidth="1.1" />
      <g clipPath="url(#arch)">
        {cells.map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y + 8})`}>
            <path d="M20 0 L40 17 L20 34 L0 17 Z" />
            <circle cx="20" cy="17" r="5.5" />
            <path d="M20 6 Q26 17 20 28 Q14 17 20 6" />
          </g>
        ))}
      </g>
    </svg>
  );
}
