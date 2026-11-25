// SessionView.tsx: one session: its facts, each client connection with device and outcome, and the event timeline. Shown on the session page and in the reason sheet's client step.

import { notFound } from "next/navigation";
import SessionTimeline from "@/components/SessionTimeline";
import { formatNumber, formatTime, reasonLabel } from "@/lib/format";
import { getClientConnections, getSessionDetail, type SessionDetail } from "@/lib/queries";

export default async function SessionView({ id, highlight }: { id: string; highlight?: string }) {   // Reads the session and its client connections and shows them, then the timeline. Called by the session page and by ReasonSheet's client step; highlight = the client connection to mark
  const [session, connections] = await Promise.all([getSessionDetail(id), getClientConnections(id)]);
  if (!session) notFound();

  return (
    <>
      <dl className="kv">
        <dt>Session ID</dt><dd className="id">{id}</dd>
        <dt>Outcome (pipeline)</dt><dd>{outcome(session)}</dd>
        <dt>Started (app)</dt><dd>{session.started_at ? formatTime(session.started_at) : "-"}</dd>
        <dt>Ended (app)</dt><dd>{endText(session)}</dd>
        <dt>End reason (app)</dt><dd>{session.end_reason ? <span className="mono">{session.end_reason}</span> : "-"}</dd>
        <dt>First event recorded</dt><dd>{session.first_event_at ? formatTime(session.first_event_at) : "-"}</dd>
        <dt>Events recorded</dt><dd>{formatNumber(session.events)}</dd>
      </dl>
      {!session.in_app && <p className="hint">Not in the app backup: start, end and devices unknown.</p>}

      <section>
        <h3>Client connections ({connections.length})</h3>
        <p className="hint">Device, OS and browser are read from the user agent.</p>
        {connections.length === 0 ? (
          <p className="hint">{session.in_app ? "No client connections recorded." : "Not in the app data, so connections are not listed."}</p>
        ) : (
          <div className="list">
            {connections.map((row, i) => (
              <div key={row.connection_id} className={row.connection_id === highlight ? "list-row selected" : "list-row"}>
                <div className="row-main">
                  <div>Client {i + 1} · {row.device} · {row.os} · {row.browser}</div>
                  <div className="row-meta">
                    Access type <span className="mono">{row.auth_type}</span> · {formatTime(row.connected_at)} → {row.disconnected_at ? formatTime(row.disconnected_at) : "-"}
                  </div>
                </div>
                <span className="row-end">{row.tag ? <span className="mono">{tagText(row.tag, row.reason)}</span> : "Not classified"}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <SessionTimeline sessionId={id} total={session.events} />
    </>
  );
}

function tagText(tag: string, reason: string | null): string {   // "failed (setup_error)", or just the tag when there is no reason. Called for the session outcome and each connection's outcome
  return reason ? `${tag} (${reasonLabel(reason)})` : tag;
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
