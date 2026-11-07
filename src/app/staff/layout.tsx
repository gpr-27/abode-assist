import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { staffCounts } from "@/lib/staff/queries";
import { StaffNav } from "@/components/staff/nav";
import { signOut } from "./actions";
import { BRAND } from "@/lib/brand";

export const metadata = { title: { default: "Sales desk", template: "%s · Sales desk" }, robots: { index: false } };

export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  const session = await requireRole("executive", "head");
  const counts = await staffCounts();
  const head = session.role === "head";
  const items = [
    { href: "/staff/leads", label: "Leads", count: counts.needs || undefined },
    { href: "/staff/visits", label: "Visits" },
    { href: "/staff/dashboard", label: "Dashboard" },
    ...(head ? [
      { href: "/staff/review", label: "Review", count: counts.flagged || undefined },
      { href: "/staff/facts", label: "Fact sheet" },
      { href: "/staff/slots", label: "Slots" },
    ] : []),
    { href: "/staff/messages", label: "Messages" },
  ];
  // Only the review queue shows a red count; the lead count is informational on desktop.
  const deskItems = items.map((i) => (i.href === "/staff/review" ? i : { ...i, count: undefined }));

  return (
    <div className="min-h-dvh bg-paper md:grid md:grid-cols-[15rem_1fr]">
      <aside className="hidden md:flex md:flex-col md:gap-8 md:border-r md:border-line md:px-4 md:py-6 md:sticky md:top-0 md:h-dvh">
        <Link href="/staff/leads" className="px-3">
          <span className="display text-xl block">Sales desk</span>
          <span className="text-xs text-stone">{BRAND}</span>
        </Link>
        <StaffNav items={deskItems} />
        <div className="mt-auto px-3 text-sm">
          <p className="font-medium">{session.name}</p>
          <p className="text-xs text-stone">{head ? "Sales head" : "Sales executive"}</p>
          <form action={signOut} className="mt-3"><button className="btn btn-ghost btn-sm">Sign out</button></form>
          <Link href="/" className="mt-3 block text-xs text-stone hover:text-ink">Open buyer site</Link>
        </div>
      </aside>

      <header className="md:hidden sticky top-0 z-10 bg-paper/95 backdrop-blur border-b border-line">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/staff/leads" className="display text-lg">Sales desk</Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-stone">{session.name.split(" ")[0]}</span>
            <form action={signOut}><button className="btn btn-ghost btn-sm">Sign out</button></form>
          </div>
        </div>
        <StaffNav items={deskItems} mobile />
      </header>

      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8 max-w-[1200px]">{children}</main>
    </div>
  );
}
