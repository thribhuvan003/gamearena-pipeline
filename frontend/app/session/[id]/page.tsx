// session/[id]/page.tsx: one session at /session/<id>: its outcome and its client connections.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatTime } from "@/lib/format";
import { getConnections, getSession } from "@/lib/queries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function SessionPage({ params }: PageProps<"/session/[id]">) {   // Lays out the session page. Next.js calls it on every visit to /session/<id>
  return (
    <main>
      <p><Link href="/">← Dashboard</Link></p>
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <SessionDetail params={params} />
      </Suspense>
    </main>
  );
}

async function SessionDetail({ params }: Pick<PageProps<"/session/[id]">, "params">) {   // Reads one session and its connections and shows them. Called by SessionPage inside <Suspense>, because the ID is only known when someone visits
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [session, connections] = await Promise.all([getSession(id), getConnections(id)]);
  if (!session) notFound();

  return (
    <>
      <h1 className="mono">{id}</h1>
      <p className="hint">
        {session.tag}{session.reason ? ` (${session.reason})` : ""}, started {formatTime(session.started_at)}
      </p>

      <h2>Client connections ({connections.length})</h2>
      {connections.length === 0 ? (
        <p className="hint">No client connections recorded.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Connection</th><th>Outcome</th><th>Reason</th><th>Started</th></tr>
          </thead>
          <tbody>
            {connections.map((row) => (
              <tr key={row.connection_id}>
                <td className="mono">{row.connection_id}</td>
                <td>{row.tag}</td>
                <td>{row.reason ?? "-"}</td>
                <td>{formatTime(row.started_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
