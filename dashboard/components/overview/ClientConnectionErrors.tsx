// ClientConnectionErrors.tsx: each error clients logged, with how many clients logged it; warnings folded below. A client can log several.

import Link from "next/link";
import { eventLabel, formatNumber } from "@/lib/format";
import { link } from "@/lib/links";
import { getErrorFrequency, getWarnings, type CohortKey, type Range } from "@/lib/queries";

export default async function ClientConnectionErrors({ range }: { range: Range }) {   // One row per logged error; each opens exactly the clients that logged it
  const [rows, warnings] = await Promise.all([getErrorFrequency(range), getWarnings(range)]);
  const errors = rows.filter((row) => !row.warning && row.phase === null);
  const warningTotals = warnings.filter((row) => row.phase === null);

  return (
    <section className="overview-panel" aria-labelledby="client-errors-title">
      <h3 id="client-errors-title">Client errors</h3>
      <p className="hint">Distinct client connections by error and recorded phase. A client may appear in several phases, so phase counts need not add up to the total.</p>
      <ul className="list reason-list">{errors.map((row) => line(range, "client_logged", row.error, row.clients, rows.filter((phase) => phase.error === row.error && phase.phase !== null)))}</ul>
      {warningTotals.length > 0 && (
        <details className="disclosure warnings-fold">
          <summary>Warnings</summary>
          <ul className="list reason-list">{warningTotals.map((row) => line(range, "client_warning", row.event, row.clients, warnings.filter((phase) => phase.event === row.event && phase.phase !== null)))}</ul>
        </details>
      )}
    </section>
  );
}

function line(range: Range, list: CohortKey, event: string, clients: string, phases: { phase: string | null; clients: string }[]) {
  const order = ["pre-connect", "connecting", "connected"];
  const phaseList = list === "client_logged" ? "client_logged_phase" : "client_warning_phase";
  const sorted = [...phases].sort((a, b) => (order.includes(a.phase!) ? order.indexOf(a.phase!) : 3) - (order.includes(b.phase!) ? order.indexOf(b.phase!) : 3) || a.phase!.localeCompare(b.phase!));
  return (
    <li key={event}>
      <Link href={link(range, { list, arg: event })} scroll={false} className="list-row">
        <span className="row-main"><strong>{eventLabel(event)}</strong></span>
        <span className="row-end"><strong>{formatNumber(clients)}</strong></span>
        <span className="chevron" aria-hidden="true">›</span>
      </Link>
      <div className="client-error-phases">
        {sorted.map(({ phase, clients }) => (
          <Link key={phase} href={link(range, { list: phaseList, arg: `${phase}|${event}` })} scroll={false}>
            {phase === "(not recorded)" ? "No phase" : phase}: {formatNumber(clients)}
          </Link>
        ))}
      </div>
    </li>
  );
}
