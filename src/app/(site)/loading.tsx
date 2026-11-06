export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-8 py-14 space-y-5" aria-label="Loading">
      <div className="skeleton h-12 w-2/3" />
      <div className="skeleton h-6 w-1/2" />
      <div className="grid gap-4 pt-8 md:grid-cols-2"><div className="skeleton h-72" /><div className="skeleton h-72" /></div>
    </div>
  );
}
