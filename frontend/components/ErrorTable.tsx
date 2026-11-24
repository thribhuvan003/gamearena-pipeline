// ErrorTable.tsx: the error-level events, most harmful first (by sessions that did not connect).

import { formatNumber } from "@/lib/format";
import { getErrorFrequency, type Range } from "@/lib/queries";

export default async function ErrorTable({ range }: { range: Range }) {   // Lists error events for the range, ordered by sessions that did not connect. Called by the dashboard page, after the failure reasons
  const rows = await getErrorFrequency(range);

  return (
    <section>
      <h2>Errors recorded</h2>
      <p className="hint">
        Every error-level event, named as the app sent it, most harmful first. An error in a session that connected anyway did not stop the player.
      </p>
      {rows.length === 0 ? (
        <p className="hint">No errors in this period.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th className="num">Times</th>
              <th className="num">Sessions</th>
              <th className="num">Didn&apos;t connect</th>
              <th className="num">Connected anyway</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.event}>
                <td>{row.event}</td>
                <td className="num">{formatNumber(row.events)}</td>
                <td className="num">{formatNumber(row.sessions)}</td>
                <td className="num">{formatNumber(row.not_connected_sessions)}</td>
                <td className="num">{formatNumber(row.connected_sessions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
