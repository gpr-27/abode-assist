/** UI cards the assistant attaches to a message. Shared by server and client. */
export type SlotChip = { id: string; startsAt: string; left: number };

export type Card =
  | { type: "slots"; projectSlug: string; projectName: string; slots: SlotChip[]; note?: string }
  | { type: "contact_form"; reason: string; pendingSlot?: string | null }
  | { type: "booking"; visitId: string; projectName: string; startsAt: string; address: string; mapUrl: string; reraNo: string; rescheduledFrom?: string | null }
  | { type: "handoff"; executiveName: string | null }
  | { type: "projects"; projects: { slug: string; name: string; locality: string }[] };

export type ChatMessage = {
  id: string;
  role: "buyer" | "assistant" | "executive" | "system";
  content: string;
  cards: Card[];
  createdAt: string;
  authorName?: string | null;
  meta?: { provider?: string; model?: string; fallback?: boolean; guard?: string[] };
};

export type ChatAction =
  | { type: "book"; slotId: string }
  | { type: "contact"; name: string; phone: string; email?: string; consent: boolean }
  | { type: "more_slots"; projectSlug: string; part?: "morning" | "afternoon" | "evening" | "any"; after?: string }
  | { type: "human" }
  | { type: "pick_project"; projectSlug: string };
