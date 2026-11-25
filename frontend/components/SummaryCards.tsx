// SummaryCards.tsx: the session totals, then the client connection totals, as big numbers that each open their records.

import Link from "next/link";
import { formatNumber, percent } from "@/lib/format";
import { link } from "@/lib/links";
import { getClientCounts, getSessionCounts, type CohortKey, type Range } from "@/lib/queries";

export default async function SummaryCards({ range }: { range: Range }) {   // Reads both cohort counts for the range and shows the session row, then the client connection row. Called by the dashboard page, first section
  const [sessions, clients] = await Promise.all([getSessionCounts(range), getClientCounts(range)]);

  return (
    <>
      <section>
        <h2>Sessions</h2>
        <p className="hint">Every app session, by its start time in the app.</p>
        <div className="stats">
          <Stat range={range} list="app_sessions" label="App sessions" value={sessions.app_sessions} />
          <Stat range={range} list="with_telemetry" label="With telemetry" value={sessions.with_telemetry} sub={`${percent(sessions.with_telemetry, sessions.app_sessions)}% of app sessions`} />
          <Stat range={range} list="no_telemetry" label="No telemetry events" value={sessions.no_telemetry} />
        </div>
      </section>

      <section>
        <h2>Client connections</h2>
        <p className="hint">Client connections with telemetry; one session can have several.</p>
        <div className="stats">
          <Stat range={range} list="clients" label="Client connections" value={clients.clients} />
          <Stat range={range} list="clients_connected" label="Connected" value={clients.clients_connected} sub={`${percent(clients.clients_connected, clients.clients)}%`} />
          <Stat range={range} list="clients_not_connected" label="Not connected" value={clients.clients_not_connected} sub={`${percent(clients.clients_not_connected, clients.clients)}%`} />
          <Stat range={range} list="clients_unknown" label="Unknown" value={clients.clients_unknown} />
        </div>
      </section>
    </>
  );
}

function Stat({ range, list, label, value, sub }: { range: Range; list: CohortKey; label: string; value: string; sub?: string }) {   // One tile that opens its cohort's list in the sheet: label, big number and an optional sub-line. Called by SummaryCards above for each total
  return (
    <Link href={link(range, { list })} scroll={false} className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{formatNumber(value)}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </Link>
  );
}
