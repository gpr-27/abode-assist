import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { optOut } from "@/lib/services/outbox";

export const metadata: Metadata = { title: "Stop messages", robots: { index: false } };

const valid = (t: string) => /^[a-f0-9]{24}$/.test(t);

export default async function OptOutPage({ params, searchParams }: PageProps<"/optout/[token]">) {
  const { token } = await params;
  const done = (await searchParams).done === "1";
  if (!valid(token)) notFound();
  const [lead] = await sql<{ name: string; opted_out_at: Date | null }[]>`select name, opted_out_at from leads where optout_token = ${token}`;
  if (!lead) notFound();

  async function confirm() {
    "use server";
    if (!valid(token)) return;
    await optOut(token);
    redirect(`/optout/${token}?done=1`);
  }

  const stopped = done || !!lead.opted_out_at;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-line bg-white p-8 text-center">
        <h1 className="display text-3xl">{stopped ? "Messages stopped" : "Stop messages?"}</h1>
        <p className="mt-3 text-stone">
          {stopped
            ? "We won't send you any more WhatsApp or SMS messages about this enquiry. Any scheduled reminders are cancelled."
            : `Hi ${lead.name.split(" ")[0]}, confirm below and we'll stop all WhatsApp and SMS messages about your enquiry, including visit reminders.`}
        </p>
        {!stopped && (
          <form action={confirm} className="mt-6"><button className="btn btn-primary w-full">Stop all messages</button></form>
        )}
        <Link href="/" className="mt-4 inline-block text-sm text-stone underline">Back to the website</Link>
      </div>
    </main>
  );
}
