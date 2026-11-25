// SessionView.tsx: one session: its facts, each client connection with device and outcome, and the event timeline. Shown on the session page and in the sheet's session step.

import SessionTimeline, { type PageHref } from "@/components/SessionTimeline";
import { formatTime, redact, tagText } from "@/lib/format";
import { getClientConnections, getSessionDetail, type SessionDetail } from "@/lib/queries";

export default async function SessionView({ id, highlight, eventPage, pageHref }: { id: string; highlight?: string; eventPage: number; pageHref: PageHref }) {   // Reads the session and its client connections and shows them, then the timeline. Called by the session page and by the sheet's session step; highlight = the client connection to mark, eventPage and pageHref = the timeline's event page and its links
  const [session, connections] = await Promise.all([getSessionDetail(id), getClientConnections(id)]);
  if (!session) return <p className="hint">No app session or events with this ID.</p>;

  return (
    <>
      <dl className="kv">
        <dt>Session ID</dt><dd className="id">{id}</dd>
        <dt>Session outcome</dt><dd>{outcome(session)}</dd>
        <dt>App start</dt><dd>{session.started_at ? formatTime(session.started_at) : "-"}</dd>
        <dt>App end</dt><dd>{endText(session)}</dd>
        <dt>App end reason</dt><dd>{session.end_reason ? <span className="mono">{redact(session.end_reason)}</span> : "-"}</dd>
      </dl>
      {!session.in_app && <p className="hint">Not in the app backup: start, end and devices unknown.</p>}

      <section>
        <h3>Client connections ({connections.length})</h3>
        {connections.length === 0 ? (
          <p className="hint">{session.in_app ? "No client connections recorded." : "Not in the app data, so connections are not listed."}</p>
        ) : (
          <div className="list">
            {connections.map((row, i) => (
              <div key={row.connection_id} className={row.connection_id === highlight ? "list-row client-detail-row selected" : "list-row client-detail-row"}>
                <div className="row-main">
                  <div>Client {i + 1} · {row.device} · {row.os} · {row.browser}</div>
                  <div className="row-meta">
                    {row.auth_type} access · App timestamps {formatTime(row.connected_at)}{row.disconnected_at && ` → ${formatTime(row.disconnected_at)}`}
                  </div>
                </div>
                <span className="row-end">{row.tag ? tagText(row.tag, row.reason) : "Not classified"}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <SessionTimeline sessionId={id} detail={session} eventPage={eventPage} pageHref={pageHref} />
    </>
  );
}

function outcome(session: SessionDetail): string {   // The pipeline's tag in words, or why there is none. Called by SessionView for the Outcome row of the facts
  if (session.tag) return tagText(session.tag, session.reason);
  if (Number(session.events) === 0) return "Not classified: no events recorded";
  if (session.has_end_event) return "Not classified: ended, but the pipeline hasn't processed it yet";
  return "Not classified: no session_ended event recorded";
}

function endText(session: SessionDetail): string {   // The app's end time, "End time missing" when the app record has none, or "-" without an app record. Called by SessionView for the Ended row
  if (session.ended_at) return formatTime(session.ended_at);
  return session.in_app ? "End time missing" : "-";
}
