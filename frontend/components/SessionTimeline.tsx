// SessionTimeline.tsx: one session's errors (every one), its warnings (one row per event name), then all its events page by page, with private bits hidden.

import Pager from "./Pager";
import { formatClock, formatNumber, isMuted, redact } from "@/lib/format";
import { ERROR_LIMIT, EVENT_PAGE_SIZE, getErrorEvents, getEventPage, getWarningSummary, type SessionDetail, type TimelineRow } from "@/lib/queries";

// The link to one event page of this session; the sheet and the session page each build their own.
export type PageHref = (epage: number) => { pathname: string; query: Record<string, string> };

export default async function SessionTimeline({ sessionId, detail, eventPage, pageHref }: { sessionId: string; detail: SessionDetail; eventPage: number; pageHref: PageHref }) {   // Reads the session's errors, its warnings per event name and one page of all its events, and shows all three. Called by SessionView, under the client connections; detail has the real counts
  const [errors, warnings, events] = await Promise.all([getErrorEvents(sessionId), getWarningSummary(sessionId), getEventPage(sessionId, eventPage)]);
  const total = Number(detail.events);

  return (
    <section>
      <h3>Errors ({formatNumber(detail.error_events)})</h3>
      <p className="hint">
        UTC, oldest first. Addresses, links, IDs and tokens are hidden.{Number(detail.error_events) > ERROR_LIMIT && ` The first ${formatNumber(String(ERROR_LIMIT))} of ${formatNumber(detail.error_events)} are shown.`}
      </p>
      {total === 0 ? (
        <p className="hint">No events recorded for this session.</p>
      ) : (
        <>
          {errors.length > 0 && <div className="list">{errors.map(eventRow)}</div>}
          <h3>Warnings ({formatNumber(detail.warn_events)})</h3>
          {warnings.length > 0 && (
            <div className="list">
              {warnings.map((row) => (
                <div key={row.event} className={`list-row level-warn${isMuted(row.event) ? " muted" : ""}`}>
                  <div className="row-main">
                    <div><span className="mono">{row.event}</span>{row.warning && <> <span className="badge badge-warning">warning</span></>}</div>
                    <div className="row-meta">first {formatClock(row.first_at)} · last {formatClock(row.last_at)}{row.warning && " · logged as level error"}</div>
                  </div>
                  <span className="row-end">{formatNumber(row.events)}</span>
                </div>
              ))}
            </div>
          )}
          <details className="more" open={eventPage > 0}>
            <summary>All events ({formatNumber(detail.events)})</summary>
            {events.length > 0 && <div className="list">{events.map(eventRow)}</div>}
            <Pager page={eventPage} size={EVENT_PAGE_SIZE} shown={events.length} total={total} href={pageHref} />
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
