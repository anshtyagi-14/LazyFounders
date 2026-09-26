import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { JsonLd } from "../../components/JsonLd";
import { SafeImage } from "../../components/SafeImage";
import { withContactStrip } from "../../components/ContactStrip";
import { authorInitials, authorPath, listAuthors, type AuthorWithCount } from "@/lib/authors";
import { BRAND, ORGANIZATION_ID, SITE_LANG, WEBSITE_ID, absoluteUrl, breadcrumbSchema, pageMetadata, personId, personSchema } from "@/lib/seo";

// The roster changes only when a byline is added or first publishes.
export const revalidate = 3600;

const PATH = "/authors";
const CRUMBS = [
  { name: "Home", path: "/" },
  { name: "Authors", path: PATH },
];

/**
 * The Docker image is built without database access. Prerender an empty roster
 * then; ISR replaces it on the first request after deploy. At runtime a
 * database failure is a real error and goes to error.tsx.
 */
function loadAuthors(): Promise<AuthorWithCount[]> {
  return listAuthors().catch((err) => {
    if (process.env.NEXT_PHASE === "phase-production-build") return [];
    throw err;
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const authors = await loadAuthors();
  return pageMetadata({
    title: `Authors and editors at ${BRAND}`,
    description: `The people behind ${BRAND}: who edits and signs off every story, what they cover, and where to find their work.`,
    path: PATH,
    keywords: authors.map((a) => a.name),
  });
}

/**
 * The /authors hub: one crawlable page linking every byline page. It is the
 * publisher's list of the people it stands behind, so the Person nodes hang off
 * the Organization (employee) as well as the page's ItemList.
 */
function schema(authors: AuthorWithCount[]) {
  const url = absoluteUrl(PATH);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#webpage`,
        url,
        name: `Authors and editors at ${BRAND}`,
        inLanguage: SITE_LANG,
        isPartOf: { "@id": WEBSITE_ID },
        publisher: { "@id": ORGANIZATION_ID },
        about: { "@id": ORGANIZATION_ID },
        breadcrumb: breadcrumbSchema(CRUMBS),
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: authors.length,
          itemListElement: authors.map((a, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: personSchema(a, { storyCount: a.storyCount }),
          })),
        },
      },
      {
        // Same @id as the root layout's Organization node: this adds to it rather than redefining it.
        "@type": "NewsMediaOrganization",
        "@id": ORGANIZATION_ID,
        employee: authors.map((a) => ({ "@id": personId(a.slug) })),
      },
    ],
  };
}

export default async function AuthorsPage() {
  const authors = await loadAuthors();

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <JsonLd data={schema(authors)} />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <Breadcrumbs crumbs={CRUMBS} className="mb-6" />

        <header className="mb-10 border-b border-gray-200 pb-8 dark:border-gray-800">
          <h1 className="font-headline text-4xl font-semibold text-slate-900 dark:text-white">Authors and editors</h1>
          <p className="mt-4 max-w-3xl text-lg text-slate-600 dark:text-gray-400">
            Every {BRAND} story carries the byline of the person accountable for it. Stories are AI-assisted and built from
            cited sources; read <Link href="/ai-policy" className="underline">how we use AI</Link> and our{" "}
            <Link href="/editorial-policy" className="underline">editorial policy</Link>.
          </p>
        </header>

        {authors.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No bylines have published yet.</p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2">
            {withContactStrip(authors.map((a) => (
              <li key={a.id} className="flex gap-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <div
                  aria-hidden="true"
                  className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-100 text-xl font-bold text-teal-700 ring-2 ring-slate-200 dark:bg-teal-950/50 dark:text-teal-400 dark:ring-white/10"
                >
                  {a.avatarUrl ? <SafeImage src={a.avatarUrl} alt="" width={64} height={64} className="h-full w-full object-cover" /> : authorInitials(a.name)}
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    <Link href={authorPath(a.slug)} className="hover:text-teal-700 hover:underline dark:hover:text-teal-400">
                      {a.name}
                    </Link>
                  </h2>
                  <p className="text-sm font-medium text-teal-700 dark:text-teal-400">
                    {a.jobTitle}, {BRAND}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-gray-400">{a.bio}</p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-gray-500">
                    {a.storyCount} {a.storyCount === 1 ? "story" : "stories"}
                  </p>
                </div>
              </li>
            )), "authors", "col-span-full")}
          </ul>
        )}
      </main>
    </div>
  );
}
