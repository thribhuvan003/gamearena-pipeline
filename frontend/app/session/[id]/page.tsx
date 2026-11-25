// session/[id]/page.tsx: one session at /session/<id>: the app's own session record, the pipeline's outcome, each client's device and outcome, and the event timeline.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import SessionTimeline from "@/components/SessionTimeline";
import { formatNumber, formatTime } from "@/lib/format";
import { getClientConnections, getSessionDetail, type SessionDetail } from "@/lib/queries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function SessionPage({ params }: PageProps<"/session/[id]">) {   // Lays out the session page. Next.js calls it on every visit to /session/<id>
  return (
    <main>
      <p><Link href="/">← Dashboard</Link></p>
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <SessionDetailView params={params} />
      </Suspense>
    </main>
  );
}

async function SessionDetailView({ params }: Pick<PageProps<"/session/[id]">, "params">) {   // Reads the session and its client connections and shows them, then the timeline. Called by SessionPage inside <Suspense> (shows "Loading…" until ready), because the ID is only known when someone visits
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [session, connections] = await Promise.all([getSessionDetail(id), getClientConnections(id)]);
  if (!session) notFound();

  return (
    <>
      <h1 className="mono">{id}</h1>
      <table className="facts">
        <tbody>
          <tr><th>Outcome (pipeline)</th><td>{outcome(session)}</td></tr>
          <tr><th>Started (app)</th><td>{session.started_at ? formatTime(session.started_at) : "-"}</td></tr>
          <tr><th>Ended (app)</th><td>{endText(session)}</td></tr>
          <tr><th>End reason (app)</th><td>{session.end_reason ?? "-"}</td></tr>
          <tr><th>First event recorded</th><td>{session.first_event_at ? formatTime(session.first_event_at) : "-"}</td></tr>
          <tr><th>Events recorded</th><td>{formatNumber(session.events)}</td></tr>
        </tbody>
      </table>
      {!session.in_app && <p className="hint">This session is not in the app data restored from the backup, so its start, end and devices are unknown.</p>}

      <h2>Client connections ({connections.length})</h2>
      <p className="hint">
        Each row is one player connection, and the outcome is for that connection only. Device, OS and browser are guessed from the browser&apos;s user agent (the text a browser sends about itself). Access type is the app&apos;s value; what each value means is not confirmed.
      </p>
      {connections.length === 0 ? (
        <p className="hint">{session.in_app ? "No client connections recorded." : "Not in the app data, so connections are not listed."}</p>
      ) : (
        <table>
          <thead>
            <tr><th>Client</th><th>Device</th><th>OS</th><th>Browser</th><th>Access type</th><th>Connected</th><th>Disconnected</th><th>Outcome</th></tr>
          </thead>
          <tbody>
            {connections.map((row, i) => (
              <tr key={row.connection_id}>
                <td>Client {i + 1}</td>
                <td>{row.device}</td>
                <td>{row.os}</td>
                <td>{row.browser}</td>
                <td>{row.auth_type}</td>
                <td>{formatTime(row.connected_at)}</td>
                <td>{row.disconnected_at ? formatTime(row.disconnected_at) : "-"}</td>
                <td>{row.tag ? tagText(row.tag, row.reason) : "Not classified"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SessionTimeline sessionId={id} total={session.events} />
    </>
  );
}

function tagText(tag: string, reason: string | null): string {   // "failed (setup_error)", or just the tag when there is no reason. Called for the session outcome and each connection's outcome
  return reason ? `${tag} (${reason})` : tag;
}

function outcome(session: SessionDetail): string {   // The pipeline's tag in words, or why there is none. Called by SessionDetailView for the first row of the facts table
  if (session.tag) return tagText(session.tag, session.reason);
  if (Number(session.events) === 0) return "Not classified: no events recorded";
  return "Not classified: no session_ended event recorded";
}

function endText(session: SessionDetail): string {   // The app's end time, "End time missing" when the app record has none, or "-" without an app record. Called by SessionDetailView for the Ended row
  if (session.ended_at) return formatTime(session.ended_at);
  return session.in_app ? "End time missing" : "-";
}
