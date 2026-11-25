// SessionTimeline.tsx: one session's errors and warnings first, then every event in time order, with private bits hidden.

import { formatClock, formatNumber, isMuted, redact } from "@/lib/format";
import { getTimeline, type TimelineRow } from "@/lib/queries";

export default async function SessionTimeline({ sessionId, total }: { sessionId: string; total: string }) {   // Reads the session's events and shows the errors and warnings, then all events behind "Show all". Called by SessionView, under the client connections; total is the event count it already has
  const rows = await getTimeline(sessionId);
  const problems = rows.filter((row) => row.level === "error" || row.level === "warn");

  return (
    <section>
      <h3>Errors and warnings ({formatNumber(String(problems.length))})</h3>
      <p className="hint">
        UTC, oldest first. Addresses, links, IDs and tokens are hidden.{Number(total) > rows.length && ` Showing the first ${rows.length} of ${formatNumber(total)}.`}
      </p>
      {rows.length === 0 ? (
        <p className="hint">No events recorded for this session.</p>
      ) : (
        <>
          {problems.length > 0 && <div className="list">{problems.map(eventRow)}</div>}
          <details className="more">
            <summary>Show all {formatNumber(total)} events</summary>
            <div className="list">{rows.map(eventRow)}</div>
          </details>
        </>
      )}
    </section>
  );
}

function eventRow(row: TimelineRow, i: number) {   // One event as a list row: time, event, details and message, the connection it is about and who sent it. Called by SessionTimeline for both lists
  const level = row.level === "error" ? " level-error" : row.level === "warn" ? " level-warn" : "";
  const meta = [details(row), message(row)].filter((text) => text !== "-").join(" · ");
  return (
    <div key={i} className={`list-row${level}${isMuted(row.event) ? " muted" : ""}`}>
      <span className="mono">{formatClock(row.recorded_at)}</span>
      <div className="row-main">
        <div className="mono">{row.event}</div>
        {meta && <div className="row-meta">{meta}</div>}
      </div>
      <div className="row-end">{row.connection}<div className="id">sent by {row.sent_by}</div></div>
    </div>
  );
}

function details(row: TimelineRow): string {   // The known payload fields as one short line, e.g. "code 500 · phase pre-connect · stage Session". Called by eventRow for each event
  const parts = [
    row.code && `code ${row.code}`,
    row.error_code && `errorCode ${row.error_code}`,
    redact(row.error_text),
    row.phase && `phase ${row.phase}`,
    row.stage && `stage ${row.stage}`,
    row.prev && row.state && `${row.prev} → ${row.state}`,
    row.attempt && `attempt ${row.attempt}`,
    row.auth_type && `access ${row.auth_type}`,
    row.mode && `join mode ${row.mode}`,
    row.end_reason && `end: ${redact(row.end_reason)}`,
    row.category && `category ${row.category}`,
  ];
  return parts.filter(Boolean).join(" · ") || "-";
}

function message(row: TimelineRow): string {   // The event's message and failure reason, private bits hidden. Called by eventRow for each event
  return [redact(row.message), redact(row.reason)].filter(Boolean).join(" · ") || "-";
}
