"use client";
import { useState } from "react";
import { ActionButton, ActionForm } from "./action-ui";
import { deleteFact, saveFact } from "@/app/staff/actions";

type Project = { slug: string; name: string };

function FactFields({ projects, topic, answer, project }: { projects: Project[]; topic?: string; answer?: string; project?: string }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <label className="text-sm">Topic<input name="topic" required minLength={2} maxLength={80} defaultValue={topic} className="field mt-1" placeholder="e.g. Nearby schools" /></label>
        <label className="text-sm">Applies to
          <select name="project" defaultValue={project ?? ""} className="field mt-1">
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm">Answer
        <textarea name="answer" required minLength={2} maxLength={1200} rows={3} defaultValue={answer} className="field mt-1" placeholder="Write it exactly as the assistant may say it. Only registered, verifiable details." />
      </label>
    </>
  );
}

export function NewFactForm({ projects, topic }: { projects: Project[]; topic?: string }) {
  return (
    <ActionForm action={saveFact} resetOnOk className="space-y-3">
      {(pending) => (
        <>
          <FactFields projects={projects} topic={topic} />
          <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Adding…" : "Add fact"}</button>
        </>
      )}
    </ActionForm>
  );
}

export function FactRow({ fact, projects }: { fact: { id: string; topic: string; answer: string; project: string; updated: string }; projects: Project[] }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div className="py-4">
        <ActionForm action={async (s, fd) => { const r = await saveFact(s, fd); if (r?.ok) setEditing(false); return r; }} className="space-y-3">
          {(pending) => (
            <>
              <input type="hidden" name="id" value={fact.id} />
              <FactFields projects={projects} topic={fact.topic} answer={fact.answer} project={fact.project} />
              <div className="flex gap-2">
                <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </>
          )}
        </ActionForm>
      </div>
    );
  }
  return (
    <div className="grid gap-2 py-4 sm:grid-cols-[12rem_1fr_auto] sm:gap-6">
      <p className="font-medium text-sm">{fact.topic}</p>
      <div>
        <p className="leading-relaxed">{fact.answer}</p>
        <p className="mt-1 text-xs text-stone">{fact.updated}</p>
      </div>
      <div className="flex gap-1 sm:flex-col sm:items-end">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit</button>
        <ActionButton action={deleteFact.bind(null, fact.id)} tone="danger" confirm="Delete this fact?">Delete</ActionButton>
      </div>
    </div>
  );
}
