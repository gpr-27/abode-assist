import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, isStaff } from "@/lib/auth/session";
import { StaffLoginForm } from "./form";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false } };

export default async function StaffLogin() {
  if (isStaff(await getSession())) redirect("/staff/leads");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="display text-xl mb-10">{BRAND}</Link>
      <div className="w-full max-w-sm rounded-3xl border border-line bg-white p-7">
        <h1 className="display text-3xl">Sales desk</h1>
        <p className="mt-2 text-sm text-stone">For sales executives and the sales head.</p>
        <StaffLoginForm />
      </div>
      <div className="mt-6 w-full max-w-sm rounded-2xl bg-indigo-soft p-4 text-sm text-indigo">
        <p className="font-medium">Demo accounts</p>
        <ul className="mt-2 space-y-1">
          <li><span className="num">head@abode.demo</span> — sales head (everything)</li>
          <li><span className="num">priya@abode.demo</span> — executive, Project 1</li>
          <li><span className="num">neha@abode.demo</span> — executive, Project 2</li>
        </ul>
        <p className="mt-2">Password for all: <span className="num font-medium">Demo@1234</span></p>
      </div>
      <p className="mt-6 text-sm text-stone">Buying a home? <Link href="/login/buyer" className="underline">Sign in with your mobile</Link></p>
    </main>
  );
}
