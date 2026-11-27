// ClientConnectionErrors.tsx: each error clients logged, with how many clients logged it; warnings folded below. A client can log several.

import Link from "next/link";
import { eventLabel, formatNumber } from "@/lib/format";
import { link } from "@/lib/links";
import { getErrorFrequency, getWarnings, type CohortKey, type Range } from "@/lib/queries";

export default async function ClientConnectionErrors({ range }: { range: Range }) {   // One row per logged error; each opens exactly the clients that logged it
  const [rows, warnings] = await Promise.all([getErrorFrequency(range), getWarnings(range)]);
  const errors = rows.filter((row) => !row.warning);

  return (
    <section className="overview-panel" aria-labelledby="client-errors-title">
      <h3 id="client-errors-title">Client errors</h3>
      <p className="hint">Errors logged with a client ID, and how many clients logged each. A client can log several.</p>
      <ul className="list reason-list">{errors.map((row) => line(range, "client_logged", row.error, row.clients))}</ul>
      {warnings.length > 0 && (
        <details className="disclosure warnings-fold">
          <summary>Warnings</summary>
          <ul className="list reason-list">{warnings.map((row) => line(range, "client_warning", row.event, row.clients))}</ul>
        </details>
      )}
    </section>
  );
}

function line(range: Range, list: CohortKey, event: string, clients: string) {   // One event and its clients, opening exactly those clients
  return (
    <li key={event}>
      <Link href={link(range, { list, arg: event })} scroll={false} className="list-row">
        <span className="row-main"><strong>{eventLabel(event)}</strong></span>
        <span className="row-end"><strong>{formatNumber(clients)}</strong></span>
        <span className="chevron" aria-hidden="true">›</span>
      </Link>
    </li>
  );
}
