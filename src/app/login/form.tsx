"use client";
import { useActionState } from "react";
import { staffLogin, type LoginState } from "./actions";

export function StaffLoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(staffLogin, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block text-sm">Work e-mail
        <input name="email" type="email" autoComplete="username" required defaultValue={state?.email} className="field mt-1" aria-invalid={!!state?.error} />
      </label>
      <label className="block text-sm">Password
        <input name="password" type="password" autoComplete="current-password" required className="field mt-1" aria-invalid={!!state?.error} />
      </label>
      {state?.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
