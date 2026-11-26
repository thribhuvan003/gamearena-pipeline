// NoClientErrors.tsx: errors logged with no client ID: what the payload says, sessions, and times logged.

import Link from "next/link";
import { eventLabel, formatNumber, redact } from "@/lib/format";
import { link } from "@/lib/links";
import { getNoClientErrors, type NoClientErrorRow, type Range } from "@/lib/queries";

export default async function NoClientErrors({ range }: { range: Range }) {   // Lists every error logged with no client ID in the range; each row opens exactly its sessions. Called by the dashboard's overview
  const errors = await getNoClientErrors(range);

  return (
    <section className="top-errors" aria-labelledby="top-errors-title">
      <div className="section-line">
        <h2 id="top-errors-title">Errors with no client ID</h2>
      </div>
      <p className="hint">Logged without a client ID, so they belong to the session, not to one client; the phase in brackets is what the payload recorded. Sessions = app sessions that logged it; times logged = how often it was logged in total (a session can log it more than once). In brackets: the payload’s most common values.</p>
      {errors.length === 0 ? <p className="hint">No errors without a client ID in this period.</p> : (
        <div className="list overview-errors">
          <div className="overview-error-row overview-error-labels" aria-hidden="true">
            <span>Error</span>
            <span>Sessions</span>
            <span>Times logged</span>
            <span />
          </div>
          {errors.map((row) => <ErrorRow key={row.error} row={row} range={range} />)}
        </div>
      )}
    </section>
  );
}

function ErrorRow({ row, range }: { row: NoClientErrorRow; range: Range }) {   // One error: label, payload in brackets (private bits hidden), sessions, times; opens its sessions
  const payload = [
    row.phase && `phase: ${row.phase}`,
    row.stage && `stage: ${row.stage}`,
    row.detail && `reason: ${redact(row.detail)}`,
  ].filter(Boolean).join(" · ");
  return (
    <Link
      href={link(range, { list: "no_client_error", arg: row.error })} scroll={false} className="list-row overview-error-row"
      aria-label={`${eventLabel(row.error)}: ${formatNumber(row.sessions)} sessions, recorded ${formatNumber(row.events)} times`}
    >
      <span>
        <strong>{eventLabel(row.error)}</strong>
        {payload && <span className="row-meta">({payload})</span>}
        <span className="id">{row.error}</span>
      </span>
      <strong>{formatNumber(row.sessions)}</strong>
      <span>{formatNumber(row.events)}</span>
      <span className="chevron" aria-hidden="true">›</span>
    </Link>
  );
}
