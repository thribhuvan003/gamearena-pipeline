// SessionTimeline.tsx: one session's errors (every one), its warnings (one row per event name), then all its events page by page, with private bits hidden.

import Pager from "./Pager";
import { eventLabel, formatClock, formatNumber, redact } from "@/lib/format";
import { ERROR_LIMIT, EVENT_PAGE_SIZE, getErrorEvents, getEventPage, getWarningSummary, type SessionDetail, type TimelineRow } from "@/lib/queries";

// The link to one event page of this session; the sheet and the session page each build their own.
export type PageHref = (epage: number) => { pathname: string; query: Record<string, string> };

export default async function SessionTimeline({ sessionId, detail, eventPage, pageHref }: { sessionId: string; detail: SessionDetail; eventPage: number; pageHref: PageHref }) {   // Reads the session's errors, its warnings per event name and one page of all its events, and shows all three. Called by SessionView, under the client connections; detail has the real counts
  const total = Number(detail.events);
  const [errors, warnings, events] = total > 0
    ? await Promise.all([getErrorEvents(sessionId), getWarningSummary(sessionId), getEventPage(sessionId, eventPage)])
    : [[], [], []];

  return (
    <section className="session-group" aria-labelledby="events-heading">
      <h3 id="events-heading">Recorded evidence</h3>
      {total === 0 ? <p className="hint">No telemetry events recorded.</p> : (
        <div className="diagnostic-list">
          <details className="disclosure">
            <summary>Errors <span className="disclosure-value">{formatNumber(detail.error_events)}</span></summary>
            <div className="disclosure-body">
              {errors.length === 0 ? <p className="hint">No errors recorded.</p> : (
                <>
                  <p className="hint">Oldest first (UTC).{Number(detail.error_events) > ERROR_LIMIT && ` First ${formatNumber(String(ERROR_LIMIT))} shown.`}</p>
                  <div className="diagnostic-list">{errors.map(eventRow)}</div>
                </>
              )}
            </div>
          </details>
          <details className="disclosure">
            <summary>Warnings <span className="disclosure-value">{formatNumber(detail.warn_events)}</span></summary>
            <div className="disclosure-body">
              {warnings.length === 0 ? <p className="hint">No warnings recorded.</p> : warnings.map((row) => (
                <div key={row.event} className="evidence-row">
                  <div className="section-line"><strong>{eventLabel(row.event)}</strong><span>{formatNumber(row.events)}</span></div>
                  <div className="id">{row.event}{row.warning && " · App logged as an error"}</div>
                  <div className="row-meta">{formatClock(row.first_at)}{+row.last_at !== +row.first_at && ` → ${formatClock(row.last_at)}`} UTC</div>
                </div>
              ))}
            </div>
          </details>
          <details className="disclosure" open={eventPage > 0 || undefined}>
            <summary>All events <span className="disclosure-value">{formatNumber(detail.events)}</span></summary>
            <div className="disclosure-body">
              <div className="diagnostic-list">{events.map(eventRow)}</div>
              <Pager page={eventPage} size={EVENT_PAGE_SIZE} shown={events.length} total={total} href={pageHref} />
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

function eventRow(row: TimelineRow, i: number) {
  const meta = [details(row), message(row)].filter((text) => text !== "-").join(" · ");
  return (
    <div key={i} className="evidence-row">
      <div className="section-line"><strong>{eventLabel(row.event)}</strong><span>{row.connection === "-" ? row.sent_by : row.connection}</span></div>
      <div className="row-meta">{formatClock(row.recorded_at)} UTC · {row.connection !== "-" && `Sent by ${row.sent_by} · `}{row.level}</div>
      <div className="id">{row.event}</div>
      {meta && <div className="row-meta">{meta}</div>}
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
