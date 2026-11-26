// SessionView.tsx: one session: the app's record, each client connection with its device and outcome, and the event timeline. Shown in the side sheet and on /session/<id>.

import SessionTimeline, { type PageHref } from "@/components/SessionTimeline";
import { dayLabel, formatNumber, formatTime, reasonLabel, redact, tagText } from "@/lib/format";
import { getClientConnections, getSessionDetail, type ClientConnectionRow, type SessionDetail } from "@/lib/queries";

export default async function SessionView({ id, highlight, eventPage, pageHref }: { id: string; highlight?: string; eventPage: number; pageHref: PageHref }) {
  const [session, connections] = await Promise.all([getSessionDetail(id), getClientConnections(id)]);
  if (!session) return <p className="hint">No app session or events with this ID.</p>;
  const { title, note } = outcome(session);
  const started = session.started_at ?? session.first_event_at;

  return (
    <div className="session-view">
      <div className="session-outcome">
        <h3 data-status={session.tag ?? undefined}>{title}</h3>
        {note && <p>{note}</p>}
        {started && <p className="hint">{session.started_at ? "Started" : "First seen"} {readableTime(started)}</p>}
      </div>

      <section className="session-group" aria-labelledby="session-clients">
        <div className="section-line">
          <h3 id="session-clients">Client connections</h3>
          <span className="section-count">{formatNumber(String(connections.length))}</span>
        </div>
        <p className="hint">Each client has its own outcome. “No success recorded” means pipeline.connect.success was not found for that client; it does not prove the network connection failed.</p>
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

function ClientDetails({ row, index, selected }: { row: ClientConnectionRow; index: number; selected: boolean }) {
  const device = [row.device, row.os, row.browser].filter((part) => part !== "Unknown").join(" · ");
  return (
    <details className={`disclosure client-details${selected ? " selected" : ""}`}>
      <summary>
        <span>Client {index}{device && <small>{device}</small>}</span>
        <span className="disclosure-value">{row.tag ? tagText(row.tag, null) : "Outcome unavailable"}</span>
      </summary>
      <div className="disclosure-body">
        <dl className="compact-facts">
          {row.reason && <div><dt>Reason</dt><dd>{reasonLabel(row.reason)}</dd></div>}
          <div><dt>Connection ID</dt><dd className="id">{row.connection_id}</dd></div>
          <div><dt>Access</dt><dd>{row.auth_type}</dd></div>
          <div><dt>First app timestamp</dt><dd>{formatTime(row.connected_at)}</dd></div>
          <div><dt>Last app timestamp</dt><dd>{row.disconnected_at ? formatTime(row.disconnected_at) : "No timestamp recorded"}</dd></div>
          {!device && <div><dt>Device and browser</dt><dd>Unknown</dd></div>}
        </dl>
      </div>
    </details>
  );
}

function readableTime(value: Date): string {
  const time = value.toISOString();
  return `${dayLabel(time.slice(0, 10))} at ${time.slice(11, 16)} UTC`;
}

function outcome(session: SessionDetail): { title: string; note?: string } {
  if (session.tag) return { title: tagText(session.tag, null), note: session.reason ? reasonLabel(session.reason) : undefined };
  if (Number(session.events) === 0) return { title: "Outcome unavailable", note: "No telemetry was recorded." };
  return {
    title: "Outcome unavailable",
    note: session.has_end_event ? "Telemetry has yet to be classified." : "No session end event was recorded.",
  };
}
