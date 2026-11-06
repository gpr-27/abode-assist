import type { MetadataRoute } from "next";
import { getProjects } from "@/lib/queries";
import { appUrl } from "@/lib/services/outbox";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const projects = await getProjects();
  return [{ url: base }, ...projects.map((p) => ({ url: `${base}/projects/${p.slug}` }))];
}
