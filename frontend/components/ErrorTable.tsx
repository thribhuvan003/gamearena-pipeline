// ErrorTable.tsx: the errors the app logged, counted per client connection, warnings last, then the errors that name no client, counted in affected sessions.

import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { link } from "@/lib/links";
import { getErrorFrequency, getUntiedErrors, type Range } from "@/lib/queries";

export default async function ErrorTable({ range }: { range: Range }) {   // Shows each error with the client connections it hit (the count opens that client_error list), then the errors with no client (each opens its untied_error list). Called by the dashboard page, after the failure reasons
  const [rows, untied] = await Promise.all([getErrorFrequency(range), getUntiedErrors(range)]);

  return (
    <section>
      <h2>Errors recorded, per client connection</h2>
      <p className="hint">Tagged client connections that recorded each error; % = didn&apos;t connect ÷ (didn&apos;t connect + connected).</p>
      {rows.length === 0 ? (
        <p className="hint">No errors tied to a client connection in this period.</p>
      ) : (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Error</th>
                <th className="num">Clients</th>
                <th className="num">Didn&apos;t connect</th>
                <th className="num">Connected anyway</th>
                <th className="num">% didn&apos;t connect</th>
                <th className="num">Not tagged</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.error} className={row.warning ? "muted" : undefined}>
                  <td>
                    <span className="mono">{row.error}</span>
                    {row.warning && <> <span className="badge badge-warning">warning</span></>}
                    <div className="id">{formatNumber(row.events)} times</div>
                  </td>
                  <td className="num">
                    <Link href={link(range, { list: "client_error", arg: row.error })} scroll={false}>{formatNumber(row.clients)}</Link>
                  </td>
                  <td className="num">{formatNumber(row.not_connected_clients)}</td>
                  <td className="num">{formatNumber(row.connected_clients)}</td>
                  <td className="num">{row.not_connected_percent ?? "-"}</td>
                  <td className="num">{formatNumber(row.not_tagged_clients)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {untied.length > 0 && (
        <>
          <h3>Not tied to a client</h3>
          <p className="hint">Errors that name no client connection; counted in affected sessions.</p>
          <div className="list">
            {untied.map((row) => (
              <Link key={row.error} className="list-row" href={link(range, { list: "untied_error", arg: row.error })} scroll={false}>
                <span className="row-main mono">{row.error}</span>
                <span className="row-end">{formatNumber(row.events)} times · {formatNumber(row.sessions)} sessions</span>
                <span className="chevron">›</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
