"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

type Item = { href: string; label: string; count?: number; headOnly?: boolean };

export function StaffNav({ items, mobile }: { items: Item[]; mobile?: boolean }) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(href + "/");
  if (mobile) {
    return (
      <nav aria-label="Sections" className="flex gap-1 overflow-x-auto px-4 pb-3 -mx-0 [scrollbar-width:none]">
        {items.map((i) => (
          <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined}
                className={clsx("shrink-0 rounded-full px-3 py-1.5 text-sm", active(i.href) ? "bg-ink text-white" : "bg-white border border-line text-stone")}>
            {i.label}{i.count ? <span className="ml-1.5 num text-xs opacity-80">{i.count}</span> : null}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label="Sections" className="flex flex-col gap-0.5">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined}
              className={clsx("flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                active(i.href) ? "bg-indigo-soft text-indigo font-medium" : "text-stone hover:text-ink hover:bg-paper-2")}>
          <span>{i.label}</span>
          {i.count ? <span className="num rounded-full bg-bad-soft px-1.5 text-xs text-bad">{i.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
