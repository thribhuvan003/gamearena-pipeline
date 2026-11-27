// ClientConnectionErrors.tsx: every error clients logged, once: how many clients that didn't connect logged it, and how many logged it
// after connecting. Warnings and other events are folded below. Counts overlap: one client can log several.

import Link from "next/link";
import { eventLabel, formatNumber } from "@/lib/format";
import { link } from "@/lib/links";
import { getErrorFrequency, getWarnings, type CohortKey, type Range } from "@/lib/queries";

export default async function ClientConnectionErrors({ range }: { range: Range }) {   // One row per logged error; each number opens exactly its clients
  const [rows, warnings] = await Promise.all([getErrorFrequency(range), getWarnings(range)]);
  const errors = rows.filter((row) => !row.warning)
    .sort((a, b) => Number(b.not_connected_clients) + Number(b.after_success) - Number(a.not_connected_clients) - Number(a.after_success));

  return (
    <section className="overview-panel" aria-labelledby="client-errors-title">
      <h3 id="client-errors-title">Client connection errors</h3>
      <p className="hint">Each logged error once. A client can log several, so rows overlap.</p>
      <div className="list overview-errors">
        <Header />
        {errors.map((row) => (
          <Line key={row.error} range={range} event={row.error}
            failed={["client_logged_not_connected", row.not_connected_clients]} after={["client_error_after", row.after_success]} />
        ))}
      </div>
      {warnings.length > 0 && (
        <details className="disclosure warnings-fold">
          <summary>Warnings and other events</summary>
          <div className="list overview-errors">
            <Header />
            {warnings.map((row) => (
              <Line key={row.event} range={range} event={row.event}
                failed={["client_warning_not_connected", row.not_connected]} after={["client_warning_after", row.after_success]} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function Header() {   // The column names
  return (
    <div className="overview-error-row overview-error-labels" aria-hidden="true">
      <span>Logged event</span>
      <span>Didn&apos;t connect</span>
      <span>After connecting</span>
      <span />
    </div>
  );
}

function Line({ range, event, failed, after }: { range: Range; event: string; failed: [CohortKey, string]; after: [CohortKey, string] }) {   // One event and its two numbers
  return (
    <div className="list-row overview-error-row">
      <span><strong>{eventLabel(event)}</strong></span>
      <Count range={range} list={failed[0]} arg={event} value={failed[1]} />
      <Count range={range} list={after[0]} arg={event} value={after[1]} />
      <span />
    </div>
  );
}

function Count({ range, list, arg, value }: { range: Range; list: CohortKey; arg: string; value: string }) {   // One number as a link to exactly its clients (0 shows as a dash)
  return value === "0" ? <span>–</span> : <Link href={link(range, { list, arg })} scroll={false}>{formatNumber(value)}</Link>;
}
