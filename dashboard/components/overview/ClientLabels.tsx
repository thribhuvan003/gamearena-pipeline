// ClientLabels.tsx: tagged clients by device, OS, browser or access type from their app record, with how many connected or didn't.

import Link from "next/link";
import { formatNumber, percent } from "@/lib/format";
import { link } from "@/lib/links";
import { getClientsByLabel, type ClientLabelRow, type Range } from "@/lib/queries";

const KIND_TITLES: Record<ClientLabelRow["kind"], string> = { device: "Device", os: "OS", browser: "Browser", access: "Access type" };

export default async function ClientLabels({ range, title, kinds }: { range: Range; title: string; kinds: ClientLabelRow["kind"][] }) {   // One card with a short list per kind; a row opens its clients that didn't connect
  const rows = await getClientsByLabel(range);

  return (
    <section className="overview-panel" aria-label={title}>
      <h3>{title}</h3>
      <p className="hint">From each client&apos;s app record; each list adds up to all tracked clients.</p>
      {kinds.map((kind) => (
        <div key={kind} className="label-group">
          <h4>{KIND_TITLES[kind]}</h4>
          <ul className="list reason-list">
            {rows.filter((row) => row.kind === kind).map((row) => {
              const body = (
                <>
                  <span className="row-main">
                    <strong>{row.value}</strong>
                    <span className="row-meta">{formatNumber(row.connected)} connected · {formatNumber(row.not_connected)} didn&apos;t connect ({percent(row.not_connected, row.clients)}%)</span>
                  </span>
                  <span className="row-end"><strong>{formatNumber(row.clients)}</strong></span>
                </>
              );
              return (
                <li key={row.value}>
                  {Number(row.not_connected) > 0
                    ? <Link href={link(range, { list: "client_label", arg: `${kind}|${row.value}` })} scroll={false} className="list-row">{body}<span className="chevron" aria-hidden="true">›</span></Link>
                    : <div className="list-row">{body}</div>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
