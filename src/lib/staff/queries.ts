import "server-only";
import { sql } from "../db";
import type { Session } from "../auth/session";

export const PAGE_SIZE = 50;

export type LeadListFilters = {
  q?: string; source?: string; status?: string; project?: string; mine?: boolean; needs?: boolean; page?: number;
};

export type LeadListRow = {
  id: string; code: string; name: string; phone: string | null; email: string | null; wants: string | null; status: string;
  created_at: Date; first_response_at: Date | null; consent_at: Date | null; opted_out_at: Date | null;
  project_name: string | null; assigned_name: string | null; assigned_to: string | null; sources: string[]; duplicate_code: string | null;
};

export async function listLeads(f: LeadListFilters, session: Session) {
  const q = f.q?.trim() ? `%${f.q.trim()}%` : null;
  const qDigits = f.q?.replace(/\D/g, "") ?? "";
  const phoneLike = qDigits.length >= 4 ? `%${qDigits}%` : null;
  const page = Math.max(1, f.page ?? 1);
  // Same filter in both queries (the db helper has no fragment nesting, so it's written out twice).
  const source = f.source ?? null, status = f.status ?? null, project = f.project ?? null, mine = !!f.mine, needs = !!f.needs;
  const rows = await sql<LeadListRow[]>`
    select l.id, l.code, l.name, l.phone, l.email, l.wants, l.status, l.created_at, l.first_response_at, l.consent_at, l.opted_out_at,
           p.name as project_name, u.name as assigned_name, l.assigned_to,
           coalesce((select array_agg(source::text order by first_at) from
                      (select source, min(created_at) as first_at from lead_touches t where t.lead_id = l.id group by source) s), '{}') as sources,
           d.code as duplicate_code
      from leads l
      left join projects p on p.id = l.project_id
      left join users u on u.id = l.assigned_to
      left join leads d on d.id = l.duplicate_hint
     where (${q}::text is null or l.name ilike ${q} or l.code ilike ${q} or l.email ilike ${q} or (${phoneLike}::text is not null and l.phone like ${phoneLike}))
       and (${source}::text is null or exists (select 1 from lead_touches t where t.lead_id = l.id and t.source::text = ${source}))
       and (${status}::text is null or l.status::text = ${status})
       and (${project}::text is null or p.slug = ${project})
       and (${mine}::boolean = false or l.assigned_to = ${session.userId})
       and (${needs}::boolean = false or l.first_response_at is null)
     order by (l.first_response_at is null) desc, l.created_at desc
     limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`;
  const [{ total }] = await sql<{ total: number }[]>`
    select count(*)::int as total from leads l left join projects p on p.id = l.project_id
     where (${q}::text is null or l.name ilike ${q} or l.code ilike ${q} or l.email ilike ${q} or (${phoneLike}::text is not null and l.phone like ${phoneLike}))
       and (${source}::text is null or exists (select 1 from lead_touches t where t.lead_id = l.id and t.source::text = ${source}))
       and (${status}::text is null or l.status::text = ${status})
       and (${project}::text is null or p.slug = ${project})
       and (${mine}::boolean = false or l.assigned_to = ${session.userId})
       and (${needs}::boolean = false or l.first_response_at is null)`;
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function staffCounts() {
  const [r] = await sql<{ flagged: number; needs: number; dupes: number }[]>`
    select (select count(*)::int from conversations where flagged and reviewed_at is null) as flagged,
           (select count(*)::int from leads where first_response_at is null and opted_out_at is null) as needs,
           (select count(*)::int from leads where duplicate_hint is not null) as dupes`;
  return r;
}

export async function listProjects() {
  return sql<{ id: string; slug: string; name: string }[]>`select id, slug, name from projects order by name`;
}

export async function listExecutives() {
  return sql<{ id: string; name: string; role: string }[]>`select id, name, role from users where role = 'executive' and active order by name`;
}

export type LeadDetail = {
  id: string; code: string; name: string; phone: string | null; email: string | null; wants: string | null; budget: string | null;
  timeline: string | null; language: string; status: string; assigned_to: string | null; assigned_name: string | null;
  project_id: string | null; project_name: string | null; project_slug: string | null; consent_at: Date | null; opted_out_at: Date | null;
  first_response_at: Date | null; created_at: Date; summary: string | null; duplicate_hint: string | null; duplicate_code: string | null; duplicate_name: string | null;
};

export async function getLead(id: string) {
  const [l] = await sql<LeadDetail[]>`
    select l.id, l.code, l.name, l.phone, l.email, l.wants, l.budget, l.timeline, l.language, l.status, l.assigned_to, u.name as assigned_name,
           l.project_id, p.name as project_name, p.slug as project_slug, l.consent_at, l.opted_out_at, l.first_response_at, l.created_at,
           l.summary, l.duplicate_hint, d.code as duplicate_code, d.name as duplicate_name
      from leads l
      left join projects p on p.id = l.project_id
      left join users u on u.id = l.assigned_to
      left join leads d on d.id = l.duplicate_hint
     where l.id = ${id}`;
  return l ?? null;
}

export async function getLeadExtras(id: string) {
  const [touches, conversations, visits, outbox] = await Promise.all([
    sql<{ id: string; source: string; note: string | null; created_at: Date }[]>`
      select id, source::text, note, created_at from lead_touches where lead_id = ${id} order by created_at`,
    sql<{ id: string; flagged: boolean; flag_reasons: string[]; handoff_reason: string | null; created_at: Date; project_name: string | null }[]>`
      select c.id, c.flagged, c.flag_reasons, c.handoff_reason, c.created_at, p.name as project_name
        from conversations c left join projects p on p.id = c.project_id where c.lead_id = ${id} order by c.created_at`,
    sql<{ id: string; status: string; booked_via: string; party_size: number; starts_at: Date; project_name: string; created_at: Date }[]>`
      select v.id, v.status, v.booked_via, v.party_size, s.starts_at, p.name as project_name, v.created_at
        from visits v join visit_slots s on s.id = v.slot_id join projects p on p.id = s.project_id
       where v.lead_id = ${id} order by s.starts_at desc`,
    sql<{ id: string; kind: string; channel: string; template: string; body: string; send_at: Date; status: string; status_note: string | null; sent_at: Date | null }[]>`
      select id, kind, channel, template, body, send_at, status::text, status_note, sent_at from outbox where lead_id = ${id} order by send_at desc`,
  ]);
  const convIds = conversations.map((c) => c.id);
  const messages = convIds.length
    ? await sql<{ id: string; conversation_id: string; role: string; content: string; meta: Record<string, unknown>; created_at: Date; author_name: string | null }[]>`
        select m.id, m.conversation_id, m.role::text, m.content, m.meta, m.created_at, u.name as author_name
          from messages m left join users u on u.id = m.author_id
         where m.conversation_id in ${sql(convIds)} order by m.created_at, m.id`
    : [];
  return { touches, conversations, visits, outbox, messages };
}

/** Executives may act on leads that are theirs or unassigned; the sales head on any lead. */
export function canAct(session: Session, lead: { assigned_to: string | null }) {
  return session.role === "head" || !lead.assigned_to || lead.assigned_to === session.userId;
}
