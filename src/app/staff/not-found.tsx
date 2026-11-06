import Link from "next/link";

export default function StaffNotFound() {
  return (
    <div className="rounded-2xl border border-line bg-white p-8 max-w-lg">
      <h1 className="display text-2xl">Not found</h1>
      <p className="mt-2 text-sm text-stone">This lead or page doesn&apos;t exist. It may have been merged into another lead.</p>
      <Link href="/staff/leads" className="btn btn-primary btn-sm mt-5">Back to leads</Link>
    </div>
  );
}
