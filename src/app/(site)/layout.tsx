import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/auth/session";
import { currentLang } from "@/lib/lang";
import { getProjects } from "@/lib/queries";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const [lang, session, projects] = await Promise.all([currentLang(), getSession(), getProjects()]);
  return (
    <div lang={lang} className="flex min-h-dvh flex-col">
      <SiteHeader lang={lang} signedIn={session?.role === "buyer"} />
      <main className="flex-1">{children}</main>
      <SiteFooter lang={lang} projects={projects} />
    </div>
  );
}
