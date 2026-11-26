// TopErrors.tsx: the overview's errors logged before any client connected (no client ID): each error + code with what its payload says, the app sessions it happened in, and how often it was logged.

import Link from "next/link";
import { eventLabel, formatNumber, redact } from "@/lib/format";
import { link } from "@/lib/links";
import { getUntiedErrors, type PreClientErrorRow, type Range } from "@/lib/queries";

export default async function TopErrors({ range }: { range: Range }) {   // Lists every error logged with no client ID in the range; each row opens exactly its sessions. Called by the dashboard's overview
  const errors = await getUntiedErrors(range);

  return (
    <section className="top-errors" aria-labelledby="top-errors-title">
      <div className="section-line">
        <h2 id="top-errors-title">Errors before any client connected</h2>
      </div>
      <p className="hint">Logged with no client ID. Sessions = app sessions that logged it; times logged = how often it was logged in total (a session can log it more than once). In brackets: the payload’s most common values.</p>
      {errors.length === 0 ? <p className="hint">No errors before a client connected in this period.</p> : (
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

function ErrorRow({ row, range }: { row: PreClientErrorRow; range: Range }) {   // One error + code: its label, the payload's most common phase, stage and reason in brackets (private bits hidden), sessions and times; opens its sessions. Called by TopErrors for each row
  const payload = [
    row.phase && `phase: ${row.phase}`,
    row.stage && `stage: ${row.stage}`,
    row.detail && `reason: ${redact(row.detail)}`,
  ].filter(Boolean).join(" · ");
  return (
    <Link
      href={link(range, { list: "untied_error", arg: row.error })} scroll={false} className="list-row overview-error-row"
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
