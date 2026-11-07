import type { Metadata } from "next";
import Link from "next/link";
import { BuyerLoginForm } from "./form";
import { BRAND } from "@/lib/brand";
import { isDemoMode } from "@/lib/demo";

export const metadata: Metadata = { title: "Sign in to see your visits", robots: { index: false } };

export default function BuyerLogin() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="display text-xl mb-10">{BRAND}</Link>
      <div className="w-full max-w-sm rounded-3xl border border-line bg-white p-7">
        <h1 className="display text-3xl">Your site visits</h1>
        <p className="mt-2 text-sm text-stone">Sign in with the mobile number you gave us. We&apos;ll send a one-time code.</p>
        <BuyerLoginForm demo={isDemoMode()} />
      </div>
      <p className="mt-6 text-sm text-stone">Work here? <Link href="/login" className="underline">Staff sign in</Link></p>
    </main>
  );
}
