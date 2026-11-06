"use client";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { ActionForm, Result } from "./action-ui";
import { addSlots, setCapacity, toggleSlot, type ActionState } from "@/app/staff/actions";

export function SlotCell({ slot }: { slot: { id: string; time: string; held: number; capacity: number; active: boolean; past: boolean } }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  const [cap, setCap] = useState(slot.capacity);
  const full = slot.held >= slot.capacity;
  return (
    <div className="relative">
      <button type="button" disabled={slot.past} onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className={clsx("w-full rounded-lg border px-2 py-1.5 text-left text-xs num transition-colors",
          slot.past ? "border-transparent bg-paper-2 text-stone/60" :
          !slot.active ? "border-dashed border-line bg-white text-stone line-through" :
          full ? "border-indigo bg-indigo text-white" : slot.held > 0 ? "border-indigo/40 bg-indigo-soft text-indigo" : "border-line bg-white hover:border-ink")}>
        <span className="block font-medium">{slot.time}</span>
        <span>{slot.active ? `${slot.held}/${slot.capacity}` : "closed"}</span>
      </button>
      {open && !slot.past && (
        <div className="absolute z-20 mt-1 w-56 rounded-xl border border-line bg-white p-3 shadow-lg text-sm space-y-3 left-0">
          <button type="button" className="btn btn-ghost btn-sm w-full" disabled={pending}
            onClick={() => start(async () => setState(await toggleSlot(slot.id).catch(() => ({ error: "Couldn't reach the server. Try again." }))))}>{slot.active ? "Close this slot" : "Open this slot"}</button>
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => setState(await setCapacity(slot.id, cap).catch(() => ({ error: "Couldn't reach the server. Try again." })))); }}>
            <label className="text-xs grow">Capacity<input type="number" min={1} max={20} value={cap} onChange={(e) => setCap(Number(e.target.value))} className="field mt-1 py-1.5" /></label>
            <button className="btn btn-primary btn-sm" disabled={pending}>Set</button>
          </form>
          <p className="text-xs text-stone">{slot.held} booked.</p>
          <Result state={state} />
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </div>
  );
}

export function AddSlotsForm({ projects, today }: { projects: { slug: string; name: string }[]; today: string }) {
  return (
    <ActionForm action={addSlots} className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem_6rem_6rem_auto] sm:items-end">
      {(pending) => (
        <>
          <label className="text-sm">Project
            <select name="project" className="field mt-1 py-2">{projects.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select>
          </label>
          <label className="text-sm">Date<input type="date" name="date" min={today} defaultValue={today} required className="field mt-1 py-2" /></label>
          <label className="text-sm">From<select name="from" defaultValue="10" className="field mt-1 py-2">{Array.from({ length: 16 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{h}:00</option>)}</select></label>
          <label className="text-sm">To<select name="to" defaultValue="18" className="field mt-1 py-2">{Array.from({ length: 16 }, (_, i) => i + 7).map((h) => <option key={h} value={h}>{h}:00</option>)}</select></label>
          <label className="text-sm">Capacity<input type="number" name="capacity" min={1} max={20} defaultValue={2} className="field mt-1 py-2" /></label>
          <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Adding…" : "Add hourly slots"}</button>
        </>
      )}
    </ActionForm>
  );
}
