"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center px-4 text-center">
      <p className="display text-4xl">This page didn&apos;t load</p>
      <p className="mt-3 max-w-md text-stone">Something failed on our side. Try again; if it keeps happening, call the site office.</p>
      <button onClick={reset} className="btn btn-primary mt-6">Try again</button>
    </main>
  );
}
