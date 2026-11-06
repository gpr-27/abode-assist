"use client";
import { ActionForm } from "./action-ui";
import { markReviewed } from "@/app/staff/actions";

export function ReviewForm({ conversationId }: { conversationId: string }) {
  return (
    <ActionForm action={markReviewed} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      {(pending) => (
        <>
          <input type="hidden" name="conversationId" value={conversationId} />
          <label className="sr-only" htmlFor={`note-${conversationId}`}>Review note</label>
          <input id={`note-${conversationId}`} name="note" maxLength={500} placeholder="Note (optional), e.g. 'Correct handoff' or 'Added school info'" className="field py-2 sm:max-w-md" />
          <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Saving…" : "Mark reviewed"}</button>
        </>
      )}
    </ActionForm>
  );
}
