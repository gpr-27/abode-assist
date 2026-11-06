"use client";
import { useTransition } from "react";
import clsx from "clsx";
import { setLanguage } from "@/app/actions";
import { LANGS } from "@/lib/i18n";
import type { Lang } from "@/lib/assistant/guardrails";

export function LangSwitch({ current, onChange }: { current: Lang; onChange?: (l: Lang) => void }) {
  const [pending, start] = useTransition();
  return (
    <div role="group" aria-label="Language" className={clsx("inline-flex rounded-full border border-line bg-white p-0.5 text-sm", pending && "opacity-60")}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          aria-pressed={current === l.code}
          title={l.label}
          onClick={() => start(async () => { onChange?.(l.code); await setLanguage(l.code); })}
          className={clsx("rounded-full px-2.5 py-1 transition-colors", current === l.code ? "bg-ink text-white" : "text-stone hover:text-ink")}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}
