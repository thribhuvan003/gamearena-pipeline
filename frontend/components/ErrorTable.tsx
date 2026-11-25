// ErrorTable.tsx: the errors the app logged, counted per client connection, warnings last, then the errors that name no client.

import { formatNumber } from "@/lib/format";
import { getErrorFrequency, getUntiedErrors, type Range } from "@/lib/queries";

export default async function ErrorTable({ range }: { range: Range }) {   // Shows each error with the client connections it hit, then the errors with no client. Called by the dashboard page, after the failure reasons
  const [rows, untied] = await Promise.all([getErrorFrequency(range), getUntiedErrors(range)]);

  return (
    <section>
      <h2>Errors recorded, per client connection</h2>
      <p className="hint">Counted per client connection. ice.candidate.error is a warning: most clients that hit it connected anyway.</p>
      {rows.length === 0 ? (
        <p className="hint">No errors tied to a client connection in this period.</p>
      ) : (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Error</th>
                <th className="num">Clients hit</th>
                <th className="num">Didn&apos;t connect</th>
                <th className="num">Connected anyway</th>
                <th className="num">% didn&apos;t connect</th>
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
                  <td className="num">{formatNumber(row.clients)}</td>
                  <td className="num">{formatNumber(row.not_connected_clients)}</td>
                  <td className="num">{formatNumber(row.connected_clients)}</td>
                  <td className="num">{row.not_connected_percent ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {untied.length > 0 && (
        <>
          <h3>Not tied to a client</h3>
          <p className="hint">Errors that name no client connection, per session.</p>
          <div className="list">
            {untied.map((row) => (
              <div key={row.error} className="list-row">
                <span className="row-main mono">{row.error}</span>
                <span className="row-end">{formatNumber(row.events)} times · {formatNumber(row.sessions)} sessions</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
