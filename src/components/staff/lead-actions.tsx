"use client";
import { useMemo, useState } from "react";
import { ActionButton, ActionForm, SelectAction } from "./action-ui";
import {
  bookForLead, cancelLeadVisit, logCall, mergeLead, notDuplicate, reassignLead, recordConsent, refreshSummary, sendReply, takeLead, updateStatus,
} from "@/app/staff/actions";

export function StatusSelect({ leadId, status, options }: { leadId: string; status: string; options: { value: string; label: string }[] }) {
  return <SelectAction label="Lead status" value={status} options={options} action={updateStatus.bind(null, leadId)} />;
}

export function ReassignSelect({ leadId, current, executives }: { leadId: string; current: string | null; executives: { id: string; name: string }[] }) {
  return (
    <SelectAction label="Assigned executive" value={current ?? ""}
      options={[...(current ? [] : [{ value: "", label: "Unassigned" }]), ...executives.map((e) => ({ value: e.id, label: e.name }))]}
      action={async (v) => (v ? reassignLead(leadId, v) : { error: "Choose an executive." })} />
  );
}

export function TakeLeadButton({ leadId }: { leadId: string }) {
  return <ActionButton action={takeLead.bind(null, leadId)} tone="primary">Take this lead</ActionButton>;
}

export function LogCallButton({ leadId }: { leadId: string }) {
  return <ActionButton action={logCall.bind(null, leadId)}>Log a call</ActionButton>;
}

export function ConsentButton({ leadId }: { leadId: string }) {
  return <ActionButton action={recordConsent.bind(null, leadId)} confirm="Did the buyer agree on the call to WhatsApp/SMS messages?">Record verbal consent</ActionButton>;
}

export function RefreshSummaryButton({ leadId }: { leadId: string }) {
  return <ActionButton action={refreshSummary.bind(null, leadId)} tone="quiet" pendingLabel="Summarising…">Refresh summary</ActionButton>;
}

export function DuplicateActions({ leadId, intoId, intoCode, canMerge }: { leadId: string; intoId: string; intoCode: string; canMerge: boolean }) {
  return (
    <span className="flex flex-wrap gap-2">
      {canMerge && <ActionButton action={mergeLead.bind(null, leadId, intoId)} tone="primary" confirm={`Merge this lead into ${intoCode}? Chats, visits and sources move over.`}>Merge into {intoCode}</ActionButton>}
      <ActionButton action={notDuplicate.bind(null, leadId)}>Not a duplicate</ActionButton>
    </span>
  );
}

export function CancelVisitButton({ visitId, leadId }: { visitId: string; leadId: string }) {
  return <ActionButton action={cancelLeadVisit.bind(null, visitId, leadId)} tone="danger" confirm="Cancel this visit?">Cancel visit</ActionButton>;
}

export function ReplyForm({ leadId, conversationId, disabled }: { leadId: string; conversationId: string; disabled?: string }) {
  if (disabled) return <p className="text-sm text-stone">{disabled}</p>;
  return (
    <ActionForm action={sendReply} resetOnOk className="space-y-2">
      {(pending) => (
        <>
          <input type="hidden" name="leadId" value={leadId} />
          <input type="hidden" name="conversationId" value={conversationId} />
          <label className="sr-only" htmlFor={`reply-${conversationId}`}>Reply to the buyer</label>
          <textarea id={`reply-${conversationId}`} name="text" rows={2} maxLength={1000} required className="field" placeholder="Reply in the buyer's chat. No discounts or final prices in writing." />
          <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Sending…" : "Send reply"}</button>
        </>
      )}
    </ActionForm>
  );
}

type SlotOpt = { id: string; project: string; label: string; day: string };

export function BookVisitForm({ leadId, slots, defaultProject }: { leadId: string; slots: SlotOpt[]; defaultProject: string | null }) {
  const projects = useMemo(() => [...new Set(slots.map((s) => s.project))], [slots]);
  const [project, setProject] = useState(defaultProject && projects.includes(defaultProject) ? defaultProject : projects[0] ?? "");
  const visible = slots.filter((s) => s.project === project);
  const days = [...new Set(visible.map((s) => s.day))];
  if (!slots.length) return <p className="text-sm text-stone">No open slots in the next 14 days. Ask the sales head to add some.</p>;
  return (
    <ActionForm action={bookForLead} className="grid gap-2">
      {(pending) => (
        <>
          <input type="hidden" name="leadId" value={leadId} />
          <label className="text-sm">Project
            <select className="field mt-1 py-2" value={project} onChange={(e) => setProject(e.target.value)}>
              {projects.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-sm">Open time
            <select name="slotId" className="field mt-1 py-2" required defaultValue="">
              <option value="" disabled>Choose a time</option>
              {days.map((d) => (
                <optgroup key={d} label={d}>
                  {visible.filter((s) => s.day === d).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <button className="btn btn-primary btn-sm justify-self-start" disabled={pending}>{pending ? "Booking…" : "Book visit"}</button>
        </>
      )}
    </ActionForm>
  );
}
