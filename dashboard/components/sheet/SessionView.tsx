// SessionView.tsx: one session: its outcome, each client connection, and the timeline (sheet and /session/<id>).

import SessionTimeline, { type PageHref } from "@/components/sheet/SessionTimeline";
import { dayLabel, formatNumber, formatTime, reasonLabel, redact, tagText } from "@/lib/format";
import { getClientConnections, getSessionDetail, type ClientConnectionRow, type SessionDetail } from "@/lib/queries";

export default async function SessionView({ id, highlight, eventPage, pageHref }: { id: string; highlight?: string; eventPage: number; pageHref: PageHref }) {   // Reads the session and its clients and shows them; highlight = the client to open
  const [session, connections] = await Promise.all([getSessionDetail(id), getClientConnections(id)]);
  if (!session) return <p className="hint">No app session or events with this ID.</p>;
  const index = connections.findIndex((row) => row.connection_id === highlight);
  const { title, note, status } = index >= 0 ? clientOutcome(connections[index], index + 1, session) : outcome(session);
  const started = session.started_at ?? session.first_event_at;

  return (
    <div className="session-view">
      <div className="session-outcome">
        <h3 data-status={status}>{title}</h3>
        {note && <p>{note}</p>}
        {started && <p className="hint">{session.started_at ? "Started" : "First seen"} {readableTime(started)}</p>}
      </div>

      <section className="session-group" aria-labelledby="session-clients">
        <div className="section-line">
          <h3 id="session-clients">Client connections</h3>
          <span className="section-count">{formatNumber(String(connections.length))}</span>
        </div>
        <p className="hint">Each client has its own outcome. “Didn't connect” means the app never logged pipeline.connect.success for it.</p>
        {Number(session.events) === 0 && connections.length > 0 && <p className="hint">These come from the app's own client records; no telemetry was logged for them, so their outcome is unavailable.</p>}
        {connections.length === 0 ? (
          <p className="hint">{session.in_app ? "No client connections recorded." : "Client records are unavailable in the app backup."}</p>
        ) : (
          <div className="diagnostic-list">
            {connections.map((row, i) => (
              <ClientDetails key={row.connection_id} row={row} index={i + 1} selected={row.connection_id === highlight} />
            ))}
          </div>
        )}
      </section>

      <SessionTimeline sessionId={id} detail={session} eventPage={eventPage} pageHref={pageHref} />

      <details className="disclosure session-metadata">
        <summary>Session details</summary>
        <div className="disclosure-body">
          <dl className="compact-facts">
            <div><dt>Session ID</dt><dd className="id">{id}</dd></div>
            <div><dt>App start</dt><dd>{session.started_at ? readableTime(session.started_at) : "Unavailable"}</dd></div>
            <div><dt>App end</dt><dd>{session.ended_at ? readableTime(session.ended_at) : session.in_app ? "No end time recorded" : "Unavailable"}</dd></div>
            {session.end_reason && <div><dt>App end reason</dt><dd>{redact(session.end_reason)}</dd></div>}
            {session.first_event_at && <div><dt>First event</dt><dd>{readableTime(session.first_event_at)}</dd></div>}
          </dl>
        </div>
      </details>
    </div>
  );
}

function ClientDetails({ row, index, selected }: { row: ClientConnectionRow; index: number; selected: boolean }) {   // One client as a fold: device, outcome, reason, ID, access type and the app's two timestamps. Called by SessionView for each client
  const device = [row.device, row.os, row.browser].filter((part) => part !== "Unknown").join(" · ");
  return (
    <details className={`disclosure client-details${selected ? " selected" : ""}`}>
      <summary>
        <span>Client {index}{device && <small>{device}</small>}</span>
        <span className="disclosure-value">{row.tag ? tagText(row.tag, null) : "Outcome not recorded"}</span>
      </summary>
      <div className="disclosure-body">
        <dl className="compact-facts">
          {row.reason && <div><dt>Reason</dt><dd>{reasonLabel(row.reason)}</dd></div>}
          <div><dt>Connection ID</dt><dd className="id">{row.connection_id}</dd></div>
          <div><dt>Access</dt><dd>{row.auth_type}</dd></div>
          <div><dt>App record start</dt><dd>{formatTime(row.connected_at)}</dd></div>
          <div><dt>App record end</dt><dd>{row.disconnected_at ? formatTime(row.disconnected_at) : "No timestamp recorded"}</dd></div>
          {!device && <div><dt>Device and browser</dt><dd>Unknown</dd></div>}
        </dl>
      </div>
    </details>
  );
}

function readableTime(value: Date): string {   // A timestamp as "17 Oct 2026 at 08:27 UTC". Called by SessionView
  const time = value.toISOString();
  return `${dayLabel(time.slice(0, 10))} at ${time.slice(11, 16)} UTC`;
}

// Reasons that come from the phase of the last connect failure.
const PHASE_REASONS = ["setup_error", "error_while_connecting", "error_other"];

type Headline = { title: string; note?: string; status?: string };

function clientOutcome(client: ClientConnectionRow, number: number, session: SessionDetail): Headline {   // The headline for the client the viewer opened, with the session's outcome underneath
  const own = client.tag ? tagText(client.tag, null) : "Outcome not recorded";
  const reason = client.reason ? `${reasonLabel(client.reason)} · ` : "";
  const other = session.tag === "connected" && client.tag !== "connected" ? " (another client logged pipeline.connect.success)" : "";
  return { title: `Client ${number}: ${own}`, note: `${reason}Session: ${outcome(session).title}${other}`, status: client.tag === "not_connected" ? "failed" : undefined };
}

function outcome(session: SessionDetail): Headline {   // The session's outcome with a short note, or why there is none
  if (session.tag === "connected") return { title: tagText(session.tag, null), note: "At least one client in this session connected.", status: "connected" };
  if (session.reason && PHASE_REASONS.includes(session.reason) && session.failure_no_client) {
    return { title: tagText(session.tag!, null), note: `${reasonLabel(session.reason)} · from an error logged with no client ID; each client below shows its own evidence.`, status: session.tag! };
  }
  if (session.tag === "failed") return { title: tagText(session.tag, null), note: session.reason ? reasonLabel(session.reason) : undefined, status: session.tag };
  if (Number(session.events) === 0) return { title: "No telemetry recorded" };
  const why = session.tag === "no_attempt" ? "No attempt or success up to session_ended." : session.has_end_event ? "Telemetry has yet to be tagged." : "No session_ended recorded.";
  const evidence = [
    session.recorded_success && "pipeline.connect.success recorded",
    session.recorded_failure && "pipeline.connect.failure recorded",
    Number(session.error_events) > 0 && `${formatNumber(session.error_events)} errors`,
    Number(session.warn_events) > 0 && `${formatNumber(session.warn_events)} warnings`,
  ].filter(Boolean).join(" · ");
  return { title: "Session not classified", note: [why, evidence].filter(Boolean).join(" ") };
}
