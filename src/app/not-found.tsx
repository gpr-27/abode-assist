import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="display text-5xl">Page not found</p>
      <p className="mt-3 text-stone">The link may be old, or the page has moved.</p>
      <div className="mt-6 flex gap-3">
        <Link href="/" className="btn btn-primary">Go to the homepage</Link>
        <Link href="/chat" className="btn btn-ghost">Start a chat</Link>
      </div>
    </main>
  );
}
