// SessionTimeline.tsx: one session's events in time order: who sent each one, which connection it is about, the error code, phase and stage, and the message with private bits hidden.

import { formatClock, formatNumber, redact } from "@/lib/format";
import { getTimeline, type TimelineRow } from "@/lib/queries";

export default async function SessionTimeline({ sessionId, total }: { sessionId: string; total: string }) {   // Reads the session's events and shows them as a table, warnings and errors highlighted. Called by the session page, under the client connections; total is the event count the page already has
  const rows = await getTimeline(sessionId);

  return (
    <section>
      <h2>Event timeline ({formatNumber(total)})</h2>
      <p className="hint">
        Every event recorded for this session (by the player&apos;s browser, the host or the server), oldest first, in UTC. Client numbers match the table above. Addresses, links, IDs and tokens in text are hidden.
      </p>
      {Number(total) > rows.length && <p className="hint">Showing the first {rows.length} of {formatNumber(total)}.</p>}
      {rows.length === 0 ? (
        <p className="hint">No events recorded for this session.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Time (UTC)</th><th>Sent by</th><th>Connection</th><th>Level</th><th>Event</th><th>Details</th><th>Message</th></tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={`level-${row.level}`}>
                <td className="mono">{formatClock(row.recorded_at)}</td>
                <td>{row.sent_by}</td>
                <td>{row.connection}</td>
                <td>{row.level}</td>
                <td className="mono">{row.event}</td>
                <td>{details(row)}</td>
                <td>{message(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function details(row: TimelineRow): string {   // The known payload fields as one short line, e.g. "code 500 · phase pre-connect · stage Session". Called by SessionTimeline for each row
  const parts = [
    row.code && `code ${row.code}`,
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

function message(row: TimelineRow): string {   // The event's message and failure reason, private bits hidden. Called by SessionTimeline for each row
  return [redact(row.message), redact(row.reason)].filter(Boolean).join(" · ") || "-";
}
