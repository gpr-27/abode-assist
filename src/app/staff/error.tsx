"use client";

export default function StaffError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-line bg-white p-8 max-w-lg">
      <h1 className="display text-2xl">This page couldn&apos;t load</h1>
      <p className="mt-2 text-sm text-stone">
        The sales desk couldn&apos;t reach the database or hit an unexpected error. Nothing you entered was lost. Try again; if it keeps happening, note the reference below for support.
      </p>
      {error.digest && <p className="mt-3 text-xs text-stone num">Reference: {error.digest}</p>}
      <button className="btn btn-primary btn-sm mt-5" onClick={reset}>Try again</button>
    </div>
  );
}
