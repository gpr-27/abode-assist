"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { LangSwitch } from "../lang-switch";
import { T } from "@/lib/i18n";
import type { Lang } from "@/lib/assistant/guardrails";
import type { ChatAction, ChatMessage } from "@/lib/assistant/cards";
import { CardView } from "./cards";
import { FormattedText } from "../formatted-text";

type Props = {
  initialLang: Lang;
  project: { slug: string; name: string; rera: string; locality: string } | null;
  slotId: string | null;
  intent: string | null;
};

type Status = "loading" | "ready" | "sending" | "offline";

export function ChatClient({ initialLang, project, slotId, intent }: Props) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [lastFailed, setLastFailed] = useState<{ text?: string; action?: ChatAction } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const t = T[lang];
  const projectSlug = project?.slug ?? null;

  const merge = useCallback((incoming: ChatMessage[]) => {
    setMessages((prev) => {
      const seen = new Set(prev.filter((m) => !m.id.startsWith("local-")).map((m) => m.id));
      const kept = prev.filter((m) => !m.id.startsWith("local-"));
      return [...kept, ...incoming.filter((m) => !seen.has(m.id))].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  }, []);

  const send = useCallback(async (payload: { text?: string; action?: ChatAction }) => {
    setStatus("sending");
    setError(null);
    if (payload.text) {
      setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "buyer", content: payload.text!, cards: [], createdAt: new Date().toISOString() }]);
    }
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, lang, project: projectSlug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? t.chatOffline);
      merge(data.messages as ChatMessage[]);
      setLastFailed(null);
      setStatus("ready");
    } catch (e) {
      setMessages((m) => m.filter((x) => !x.id.startsWith("local-")));
      setError((e as Error).message || t.chatOffline);
      setLastFailed(payload);
      if (payload.text) setText(payload.text);
      setStatus("ready");
    }
  }, [lang, projectSlug, merge, t.chatOffline]);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const qs = new URLSearchParams({ lang, ...(project ? { project: project.slug } : {}) });
      const res = await fetch(`/api/chat?${qs}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMessages(data.messages);
      setStatus("ready");
      return true;
    } catch {
      setStatus("offline");
      return false;
    }
  }, [lang, project]);

  // First load, then act on deep links once (slot from a project page, or "book a visit").
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const ok = await load();
      if (!ok) return;
      if (slotId) await send({ action: { type: "book", slotId } });
      else if (intent === "visit" && project) await send({ action: { type: "pick_project", projectSlug: project.slug } });
      if (slotId || intent) window.history.replaceState(null, "", project ? `/chat?project=${project.slug}` : "/chat");
    })();
  }, [load, send, slotId, intent, project]);

  // Executives reply from the staff side; pick those up while the tab is open.
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden || status !== "ready") return;
      const last = messages.filter((m) => !m.id.startsWith("local-")).at(-1)?.createdAt;
      if (!last) return;
      try {
        const res = await fetch(`/api/chat?${new URLSearchParams({ lang, since: last, ...(project ? { project: project.slug } : {}) })}`);
        if (res.ok) merge((await res.json()).messages);
      } catch { /* offline; try again next tick */ }
    }, 8000);
    return () => clearInterval(id);
  }, [messages, status, lang, project, merge]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, status]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || status === "sending") return;
    setText("");
    send({ text: v });
  };

  const busy = status === "sending";
  const lastCardId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  return (
    <div lang={lang} className="flex h-dvh flex-col bg-paper">
      <header className="border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <Link href={project ? `/projects/${project.slug}` : "/"} className="text-sm text-stone hover:text-ink" aria-label={t.brand}>←<span className="hidden sm:inline"> {t.brand}</span></Link>
            <p className="display truncate text-lg leading-tight">{project ? `${project.name}, ${project.locality}` : t.chatTitle}</p>
            {project && <p className="truncate text-xs text-stone">{t.rera} {project.rera}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LangSwitch current={lang} onChange={setLang} />
            <button type="button" className="btn btn-ghost btn-sm hidden sm:inline-flex" disabled={busy || status !== "ready"}
                    onClick={() => send({ action: { type: "human" } })}>{t.talkToPerson}</button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto" aria-live="polite">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
          {status === "loading" && messages.length === 0 && (
            <div className="space-y-3" aria-label="Loading">
              <div className="skeleton h-5 w-3/4" /><div className="skeleton h-5 w-1/2" /><div className="skeleton h-10 w-2/3" />
            </div>
          )}
          {status === "offline" && (
            <div className="rounded-2xl border border-line bg-white p-6 text-center">
              <p>{t.chatOffline}</p>
              <button className="btn btn-primary btn-sm mt-4" onClick={load}>{t.retry}</button>
            </div>
          )}
          {messages.map((m) => <Bubble key={m.id} m={m} lang={lang} busy={busy} live={m.id === lastCardId} onAction={(a) => send({ action: a })} />)}
          {busy && (
            <div className="typing flex gap-1.5 py-2" aria-label="Assistant is typing"><span /><span /><span /></div>
          )}
          {error && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">
              <span>{error}</span>
              {lastFailed?.action && <button className="underline" onClick={() => send(lastFailed)}>{t.retry}</button>}
            </div>
          )}
          <div ref={bottom} />
        </div>
      </main>

      <footer className="border-t border-line bg-white">
        <form onSubmit={onSubmit} className="mx-auto flex max-w-3xl items-end gap-2 px-4 py-3">
          <label htmlFor="chat-input" className="sr-only">{t.typeHere}</label>
          <textarea
            id="chat-input" rows={1} maxLength={1000} value={text} placeholder={t.typeHere}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(e); } }}
            className="field max-h-40 min-h-[46px] resize-none"
            disabled={status === "offline"}
          />
          <button type="submit" className="btn btn-primary h-[46px]" disabled={busy || !text.trim() || status === "offline"}>{t.send}</button>
        </form>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pb-3 text-xs text-stone">
          <span>{t.poweredNote}</span>
          <button type="button" className="sm:hidden underline shrink-0" disabled={busy} onClick={() => send({ action: { type: "human" } })}>{t.talkToPerson}</button>
        </div>
      </footer>
    </div>
  );
}

function Bubble({ m, lang, busy, live, onAction }: { m: ChatMessage; lang: Lang; busy: boolean; live: boolean; onAction: (a: ChatAction) => void }) {
  if (m.role === "system") {
    return <p className="rise mx-auto max-w-md text-center text-xs text-stone">{m.content}</p>;
  }
  const mine = m.role === "buyer";
  return (
    <div className={clsx("rise flex flex-col gap-2", mine ? "items-end" : "items-start")}>
      {m.role === "executive" && <p className="text-xs text-indigo">{m.authorName ?? "Sales team"}</p>}
      {m.content && (mine ? (
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-indigo px-4 py-2.5 leading-relaxed text-white [overflow-wrap:anywhere]">{m.content}</div>
      ) : m.role === "executive" ? (
        <FormattedText text={m.content} className="max-w-[85%] rounded-2xl rounded-bl-md border border-indigo/30 bg-indigo-soft px-4 py-3 leading-relaxed" />
      ) : (
        <FormattedText text={m.content} className="max-w-[36rem] text-[1.02rem] leading-[1.65]" />
      ))}
      {m.cards.map((c, i) => <CardView key={i} card={c} lang={lang} busy={busy} live={live} onAction={onAction} />)}
    </div>
  );
}
