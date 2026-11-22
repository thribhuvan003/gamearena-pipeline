// ErrorTable.tsx: how often each error-level event was recorded.

import { formatNumber } from "@/lib/format";
import { getErrorFrequency } from "@/lib/queries";

export default async function ErrorTable() {                     // Lists error events by frequency. Called by the dashboard page, after the failure reasons
  const rows = await getErrorFrequency();

  return (
    <section>
      <h2>Errors recorded</h2>
      <p className="hint">Every error-level event, named as the app sent it. Events = times recorded; sessions = how many sessions it happened in.</p>
      <table>
        <thead>
          <tr><th>Event</th><th className="num">Events</th><th className="num">Sessions</th><th className="num">Of which connected</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.event}>
              <td>{row.event}</td>
              <td className="num">{formatNumber(row.events)}</td>
              <td className="num">{formatNumber(row.sessions)}</td>
              <td className="num">{formatNumber(row.connected_sessions)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
