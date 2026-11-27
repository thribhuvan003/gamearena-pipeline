// ClientErrors.tsx: clients that connected, then logged an error (stability after connecting). Errors of clients that didn't
// connect are not repeated here: they are in each reason's list on the left.

import Link from "next/link";
import { eventLabel, formatNumber } from "@/lib/format";
import { link } from "@/lib/links";
import { getErrorFrequency, type ErrorRow, type Range } from "@/lib/queries";

export default async function ClientErrors({ range }: { range: Range }) {   // One row per error logged after pipeline.connect.success; each opens exactly those clients
  const rows = (await getErrorFrequency(range)).filter((row) => Number(row.connected_then_error) > 0);
  const errors = rows.filter((row) => !row.warning).sort((a, b) => Number(b.connected_then_error) - Number(a.connected_then_error));
  const warnings = rows.filter((row) => row.warning);

  return (
    <section className="overview-panel" aria-labelledby="logged-errors-title">
      <h3 id="logged-errors-title">Errors after connecting</h3>
      <p className="hint">Clients that logged pipeline.connect.success, then this error (none of it before). For clients that didn&apos;t connect, open a reason on the left.</p>
      <div className="card-body">
        {rows.length === 0 ? <p className="hint">No errors after connecting in this period.</p> : (
          <ul className="list reason-list">
            {[...errors, ...warnings].map((row) => <ErrorLine key={row.error} row={row} range={range} />)}
          </ul>
        )}
      </div>
    </section>
  );
}

function ErrorLine({ row, range }: { row: ErrorRow; range: Range }) {   // One error: its name and the clients that connected, then logged it
  return (
    <li>
      <Link href={link(range, { list: "client_error_after", arg: row.error })} scroll={false} className="list-row">
        <span className="row-main">
          <strong>{eventLabel(row.error)}</strong>
          {row.warning && <span className="row-meta">Logged at error level; shown as a warning</span>}
        </span>
        <span className="row-end"><strong>{formatNumber(row.connected_then_error)}</strong><small>clients</small></span>
        <span className="chevron" aria-hidden="true">›</span>
      </Link>
    </li>
  );
}
