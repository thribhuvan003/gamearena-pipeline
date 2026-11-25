// session/[id]/page.tsx: one session at /session/<id> (the same view the sheet's session step shows), for a direct link.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import SessionView from "@/components/SessionView";
import { shortId } from "@/lib/format";
import { isUuid, readSheet } from "@/lib/links";

export default function SessionPage({ params, searchParams }: PageProps<"/session/[id]">) {   // Lays out the session page. Next.js calls it on every visit to /session/<id>
  return (
    <main>
      <p className="hint"><Link href="/">‹ Dashboard</Link></p>
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <SessionPageBody params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function SessionPageBody({ params, searchParams }: PageProps<"/session/[id]">) {   // Checks the ID, reads the event page (?epage=) and shows the session. Called by SessionPage inside <Suspense> (shows "Loading…" until ready), because the ID is only known when someone visits
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const eventPage = readSheet(await searchParams).epage ?? 0;

  return (
    <>
      <div className="page-head">
        <h1>Session {shortId(id)}</h1>
      </div>
      <SessionView
        id={id}
        eventPage={eventPage}
        pageHref={(epage) => ({ pathname: `/session/${id}`, query: epage ? { epage: String(epage) } : ({} as Record<string, string>) })}
      />
    </>
  );
}
