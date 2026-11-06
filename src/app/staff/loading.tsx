export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      <div className="skeleton h-9 w-56" />
      <div className="skeleton h-4 w-80" />
      <div className="mt-6 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}
      </div>
    </div>
  );
}
