// NoClientErrors.tsx: errors logged with no client ID, by sessions: how many of those sessions didn't connect, connected or have no outcome.

import Link from "next/link";
import { eventLabel, formatNumber, redact } from "@/lib/format";
import { link } from "@/lib/links";
import { getNoClientErrors, type CohortKey, type NoClientErrorRow, type Range } from "@/lib/queries";

export default async function NoClientErrors({ range }: { range: Range }) {   // One row per error; each number opens exactly those sessions
  const errors = await getNoClientErrors(range);

  return (
    <section className="overview-panel top-errors" aria-labelledby="top-errors-title">
      <h3 id="top-errors-title">Errors logged by sessions</h3>
      <p className="hint">Errors logged with no client ID, by the sessions that logged them. First line: the app&apos;s most common reason text.</p>
      <div className="card-body">
        {errors.length === 0 ? <p className="hint">No errors without a client ID in this period.</p> : (
          <div className="list overview-errors">
            <div className="overview-error-row session-error-row overview-error-labels" aria-hidden="true">
              <span>Logged event</span>
              <span>Didn&apos;t connect</span>
              <span>Connected</span>
              <span>No outcome</span>
            </div>
            {errors.map((row) => <ErrorRow key={row.error} row={row} range={range} />)}
          </div>
        )}
      </div>
    </section>
  );
}

function ErrorRow({ row, range }: { row: NoClientErrorRow; range: Range }) {   // One error: the app's reason text (private bits hidden), then event, code, phase, stage; then the sessions by outcome
  const where = [eventLabel(row.error), row.phase && `phase ${row.phase}`, row.stage && `stage ${row.stage}`].filter(Boolean).join(" · ");
  return (
    <div className="list-row overview-error-row session-error-row">
      <span>
        <Link href={link(range, { list: "no_client_error", arg: row.error })} scroll={false}><strong>{row.detail ? redact(row.detail) : eventLabel(row.error)}</strong></Link>
        <span className="row-meta">{where} · {formatNumber(row.sessions)} sessions, logged {formatNumber(row.events)} times</span>
      </span>
      <Count range={range} list="no_client_error_failed" arg={row.error} value={row.not_connected} />
      <Count range={range} list="no_client_error_connected" arg={row.error} value={row.connected} />
      <Count range={range} list="no_client_error_no_outcome" arg={row.error} value={row.no_outcome} />
    </div>
  );
}

function Count({ range, list, arg, value }: { range: Range; list: CohortKey; arg: string; value: string }) {   // One number as a link to exactly its sessions (0 stays plain)
  return value === "0" ? <span>0</span> : <Link href={link(range, { list, arg })} scroll={false}>{formatNumber(value)}</Link>;
}
