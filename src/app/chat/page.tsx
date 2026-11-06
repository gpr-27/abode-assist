import type { Metadata } from "next";
import { currentLang } from "@/lib/lang";
import { getProjects } from "@/lib/queries";
import { ChatClient } from "@/components/chat/chat-client";

export const metadata: Metadata = { title: "Chat and book a site visit", robots: { index: false } };

export default async function ChatPage({ searchParams }: PageProps<"/chat">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const [lang, projects] = await Promise.all([currentLang(), getProjects()]);
  const project = projects.find((p) => p.slug === one(sp.project)) ?? null;
  return (
    <ChatClient
      initialLang={lang}
      project={project ? { slug: project.slug, name: project.name, rera: project.rera_no, locality: project.locality } : null}
      slotId={one(sp.slot)}
      intent={one(sp.intent)}
    />
  );
}
