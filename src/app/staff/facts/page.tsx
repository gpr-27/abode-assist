import { requireRole } from "@/lib/auth/session";
import { sql } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { Empty, Notice, PageHeader } from "@/components/ui";
import { FactRow, NewFactForm } from "@/components/staff/fact-forms";

export const metadata = { title: "Fact sheet" };

export default async function FactsPage({ searchParams }: PageProps<"/staff/facts">) {
  await requireRole("head");
  const sp = await searchParams;
  const topic = (Array.isArray(sp.topic) ? sp.topic[0] : sp.topic)?.slice(0, 80);
  const projects = await sql<{ id: string; slug: string; name: string }[]>`select id, slug, name from projects order by name`;
  const facts = await sql<{ id: string; topic: string; answer: string; project_id: string | null; updated_at: Date; updated_by: string | null }[]>`
    select f.id, f.topic, f.answer, f.project_id, f.updated_at, u.name as updated_by
      from facts f left join users u on u.id = f.updated_by order by f.topic`;
  const groups = [{ key: null as string | null, name: "All projects", slug: "" }, ...projects.map((p) => ({ key: p.id, name: p.name, slug: p.slug }))];

  return (
    <>
      <PageHeader title="Fact sheet" sub="The assistant can only state what is written here. Anything else, it hands to a person. Changes apply from the next chat message." />
      <Notice tone="warn">Write only details that match the RERA registration. Do not add discounts, offers or promised returns: the assistant is blocked from saying them anyway.</Notice>

      <section className="mt-6 rounded-2xl border border-line bg-white p-5 sm:p-6">
        <h2 className="font-medium mb-3">Add a fact{topic ? " for the flagged question" : ""}</h2>
        <NewFactForm projects={projects} topic={topic} />
      </section>

      {groups.map((g) => {
        const list = facts.filter((f) => f.project_id === g.key);
        return (
          <section key={g.name} className="mt-10">
            <h2 className="display text-2xl">{g.name}</h2>
            {list.length === 0 ? <div className="mt-4"><Empty title="No facts yet">The assistant will hand every question about this to a person.</Empty></div> : (
              <div className="mt-3 divide-y divide-line border-y border-line">
                {list.map((f) => (
                  <FactRow key={f.id} projects={projects}
                    fact={{ id: f.id, topic: f.topic, answer: f.answer, project: g.slug, updated: `Updated ${formatDateTime(f.updated_at)}${f.updated_by ? ` by ${f.updated_by}` : ""}` }} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
