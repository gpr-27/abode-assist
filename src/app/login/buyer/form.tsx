"use client";
import { useActionState } from "react";
import { requestCode, verifyCode, type OtpState } from "./actions";

export function BuyerLoginForm({ demo = false }: { demo?: boolean }) {
  const [askState, ask, asking] = useActionState<OtpState, FormData>(requestCode, { step: "phone" });
  const [verifyState, verify, verifying] = useActionState<OtpState, FormData>(verifyCode, { step: "code" });
  const onCode = askState.step === "code" && verifyState.step !== "phone";
  const error = onCode ? verifyState.error : askState.error ?? (verifyState.step === "phone" ? verifyState.error : undefined);

  if (!onCode) {
    return (
      <form action={ask} className="mt-6 space-y-4">
        <div>
          <label htmlFor="phone" className="text-sm">Mobile number</label>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-stone">+91</span>
            <input id="phone" name="phone" className="field num" inputMode="numeric" autoComplete="tel-national" placeholder="98765 58210" required maxLength={16} aria-invalid={!!error} />
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <button className="btn btn-primary w-full" disabled={asking}>{asking ? "Sending code…" : "Send code"}</button>
        {demo && <p className="text-xs text-stone">Demo: use 98765 58210 (Hardik Patel, has a booked visit).</p>}
      </form>
    );
  }

  return (
    <form action={verify} className="mt-6 space-y-4">
      <input type="hidden" name="phone" value={askState.phone} />
      {askState.demoCode && (
        <div className="rounded-xl bg-indigo-soft px-4 py-3 text-sm text-indigo">
          SMS is simulated in this demo. Your code is <strong className="num tracking-widest">{askState.demoCode}</strong>
        </div>
      )}
      <div>
        <label htmlFor="code" className="text-sm">6-digit code</label>
        <input id="code" name="code" className="field num mt-1 tracking-[0.4em] text-lg" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus aria-invalid={!!error} />
      </div>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <button className="btn btn-primary w-full" disabled={verifying}>{verifying ? "Checking…" : "Sign in"}</button>
    </form>
  );
}
