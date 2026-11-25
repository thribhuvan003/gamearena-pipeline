// session/[id]/page.tsx: one session at /session/<id> (the same view the reason sheet's client step shows), for a direct link.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import SessionView from "@/components/SessionView";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function SessionPage({ params }: PageProps<"/session/[id]">) {   // Lays out the session page. Next.js calls it on every visit to /session/<id>
  return (
    <main>
      <p className="hint"><Link href="/">‹ Dashboard</Link></p>
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <SessionPageBody params={params} />
      </Suspense>
    </main>
  );
}

async function SessionPageBody({ params }: Pick<PageProps<"/session/[id]">, "params">) {   // Checks the ID and shows the session. Called by SessionPage inside <Suspense> (shows "Loading…" until ready), because the ID is only known when someone visits
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  return (
    <>
      <div className="page-head">
        <h1 className="mono">{id}</h1>
      </div>
      <SessionView id={id} />
    </>
  );
}
