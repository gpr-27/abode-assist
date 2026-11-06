"use client";
import { useState, useTransition, type ReactNode } from "react";
import clsx from "clsx";
import type { ActionState } from "@/app/staff/actions";

const OFFLINE: ActionState = { error: "Couldn't reach the server. Check your connection and try again." };

/** Server actions reject on network failure; show that as a message instead of crashing the page. */
async function safely(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (e) {
    // Let Next.js redirects / not-found propagate.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_")) throw e;
    return OFFLINE;
  }
}

export function Result({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error) return <p role="alert" className="text-sm text-bad">{state.error}</p>;
  if (state.ok) return <p role="status" className="text-sm text-ok">{state.ok}</p>;
  return null;
}

/** A button that runs one server action. With `confirm`, the first tap asks inside the UI (no browser dialogs). */
export function ActionButton({
  action, children, className, confirm, pendingLabel, tone = "ghost", size = "sm",
}: {
  action: () => Promise<ActionState>; children: ReactNode; className?: string; confirm?: string; pendingLabel?: string;
  tone?: "primary" | "ghost" | "quiet" | "danger"; size?: "sm" | "md";
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  const [asking, setAsking] = useState(false);
  const cls = clsx("btn", size === "sm" && "btn-sm",
    tone === "primary" && "btn-primary", tone === "ghost" && "btn-ghost", tone === "quiet" && "btn-quiet",
    tone === "danger" && "btn-ghost text-bad hover:border-bad", className);
  const run = () => start(async () => { setAsking(false); setState(await safely(action)); });

  return (
    <span className="inline-flex flex-col gap-1">
      {asking ? (
        <span className="inline-flex flex-wrap items-center gap-2 text-sm">
          <span>{confirm}</span>
          <button type="button" className="btn btn-sm btn-primary" onClick={run} disabled={pending}>Yes</button>
          <button type="button" className="btn btn-sm btn-quiet" onClick={() => setAsking(false)}>No</button>
        </span>
      ) : (
        <button type="button" className={cls} disabled={pending} onClick={() => (confirm ? setAsking(true) : run())}>
          {pending ? pendingLabel ?? "Working…" : children}
        </button>
      )}
      <Result state={state} />
    </span>
  );
}

/**
 * A form bound to a (prevState, formData) server action, showing the result under it.
 * Submitted manually so fields keep their values when the action returns an error;
 * with `resetOnOk` the form clears only after success.
 */
export function ActionForm({
  action, children, className, resetOnOk,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; children: (pending: boolean, state: ActionState) => ReactNode;
  className?: string; resetOnOk?: boolean;
}) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        start(async () => {
          const r = await safely(() => action(state, fd));
          setState(r);
          if (resetOnOk && r?.ok) form.reset();
        });
      }}
    >
      {children(pending, state)}
      <div className="mt-2"><Result state={state} /></div>
    </form>
  );
}

export function SelectAction({
  action, value, options, label,
}: { action: (v: string) => Promise<ActionState>; value: string; options: { value: string; label: string }[]; label: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  const [v, setV] = useState(value);
  return (
    <span className="inline-flex flex-col gap-1">
      <select
        aria-label={label}
        className="field py-1.5 text-sm w-auto"
        value={v}
        disabled={pending}
        onChange={(e) => { const nv = e.target.value; setV(nv); start(async () => setState(await safely(() => action(nv)))); }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Result state={state} />
    </span>
  );
}
