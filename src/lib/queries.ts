import "server-only";
import { sql } from "./db";

export type ProjectSummary = {
  id: string; slug: string; name: string; rera_no: string; locality: string; address: string; map_url: string; hero_note: string;
};

export async function getProjects() {
  return sql<ProjectSummary[]>`select id, slug, name, rera_no, locality, address, map_url, hero_note from projects order by name`;
}

export async function getProject(slug: string) {
  const [p] = await sql<ProjectSummary[]>`select id, slug, name, rera_no, locality, address, map_url, hero_note from projects where slug = ${slug}`;
  return p ?? null;
}

export async function getFacts(projectId: string | null) {
  return sql<{ id: string; topic: string; answer: string; project_id: string | null; updated_at: Date }[]>`
    select id, topic, answer, project_id, updated_at from facts
     where ${projectId}::uuid is null or project_id = ${projectId} or project_id is null
     order by project_id nulls last, topic`;
}

export async function getFact(projectId: string, topic: string) {
  const [f] = await sql<{ answer: string }[]>`select answer from facts where project_id = ${projectId} and topic = ${topic}`;
  return f?.answer ?? null;
}
