// SummaryCards.tsx: the client connection totals as big numbers, then the session totals in a smaller row.

import { formatNumber } from "@/lib/format";
import { getConnectionSummary, getSessionSummary, type Range } from "@/lib/queries";

export default async function SummaryCards({ range }: { range: Range }) {   // Reads both summaries for the range and shows the client connection row, then the smaller session row. Called by the dashboard page, first section
  const [sessions, connections] = await Promise.all([getSessionSummary(range), getConnectionSummary(range)]);

  return (
    <section>
      <h2>Client connections</h2>
      <p className="hint">One session can have several client connections.</p>
      <div className="stats">
        <Stat label="Client connections" value={connections.client_connections} />
        <Stat label="Connected" value={connections.connected} sub={`${connections.connected_percent ?? 0}%`} />
        <Stat label="Not connected" value={connections.not_connected} sub={`${formatNumber(connections.not_connected_nobody)} in sessions where no client connected`} />
        <Stat label="Unknown" value={connections.unknown} />
      </div>

      <div className="stats secondary">
        <Stat label="Sessions" value={sessions.sessions} />
        <Stat label="Connected" value={sessions.connected} sub={`${sessions.connected_percent ?? 0}%`} />
        <Stat label="Failed" value={sessions.failed} />
        <Stat label="No attempt" value={sessions.no_attempt} />
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {   // One tile: label, big number and an optional sub-line. Called by SummaryCards above for each total
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{formatNumber(value)}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
