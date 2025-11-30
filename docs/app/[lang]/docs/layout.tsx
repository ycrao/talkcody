import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";


export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: React.ReactNode;
}) {
  const { lang } = await params;
  const options = baseOptions(lang, { hideNavLinks: true });

  return (
    <DocsLayout
      tree={source.pageTree[lang]}
      {...options}
      links={[]}
      githubUrl="https://github.com/talkcody/talkcody"
      themeSwitch={{ enabled: true }}
    >
      {children}
    </DocsLayout>
  );
}
