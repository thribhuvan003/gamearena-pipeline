// ClientReasons.tsx: why clients didn't connect: one reason each (the first rule that matched), then the undetermined ones split by what they logged.

import Link from "next/link";
import { formatNumber, percent, reasonLabel } from "@/lib/format";
import { link, type Sheet } from "@/lib/links";
import { getConnectionReasons, type Range } from "@/lib/queries";

const UNDETERMINED = "no_video:";

export default async function ClientReasons({ range, sheet }: { range: Range; sheet: Sheet }) {   // The matched reasons, then "Reason undetermined" with its parts; every row opens exactly its clients
  const rows = await getConnectionReasons(range);
  const sum = (list: typeof rows) => list.reduce((total, row) => total + Number(row.clients), 0);
  const total = sum(rows);
  const matched = rows.filter((row) => !row.reason.startsWith(UNDETERMINED));
  const undetermined = rows.filter((row) => row.reason.startsWith(UNDETERMINED));
  const row = (reason: string, clients: string, label: string) => (
    <li key={reason}>
      <Link href={link(range, { list: "client_reason", arg: reason })} scroll={false}
        className={sheet.list === "client_reason" && sheet.arg === reason ? "list-row selected" : "list-row"}>
        <span className="row-main"><strong>{label}</strong></span>
        <span className="row-end"><strong>{formatNumber(clients)}</strong><small>{percent(clients, String(total))}%</small></span>
        <span className="chevron" aria-hidden="true">›</span>
      </Link>
    </li>
  );

  return (
    <section className="overview-panel" aria-labelledby="reasons-title">
      <h3 id="reasons-title">{formatNumber(String(total))} clients didn&apos;t connect</h3>
      <p className="hint">One reason per client, the first rule that matched; the rows add up to {formatNumber(String(total))}.</p>
      <div className="card-body">
        {rows.length === 0 ? <p className="hint">No clients that didn&apos;t connect in this period.</p> : (
          <>
            <ul className="list reason-list">{matched.map((item) => row(item.reason, item.clients, reasonLabel(item.reason)))}</ul>
            {undetermined.length > 0 && (
              <div className="reason-group">
                <div className="section-line">
                  <strong>Reason undetermined</strong>
                  <span className="row-end"><strong>{formatNumber(String(sum(undetermined)))}</strong><small>{percent(String(sum(undetermined)), String(total))}%</small></span>
                </div>
                <p className="hint">No failure rule matched. By what the client logged itself:</p>
                <ul className="list reason-list">
                  {undetermined.map((item) => row(item.reason, item.clients, reasonLabel(item.reason).replace("Reason undetermined · ", "")))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
