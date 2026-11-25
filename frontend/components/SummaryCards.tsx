import Link from "next/link";
import { formatNumber, percent } from "@/lib/format";
import { link } from "@/lib/links";
import { getClientCounts, getSessionCounts, type CohortKey, type Range } from "@/lib/queries";

export default async function SummaryCards({ range }: { range: Range }) {
  const [sessions, clients] = await Promise.all([getSessionCounts(range), getClientCounts(range)]);
  const share = (part: string, total: string, unit: string) =>
    Number(total) > 0 ? `${percent(part, total)}% of ${unit}` : undefined;

  return (
    <div className="metric-groups">
      <section aria-labelledby="sessions-title">
        <h2 id="sessions-title">App sessions</h2>
        <div className="stats health-stats session-stats">
          <Stat range={range} list="app_sessions" label="Total sessions" value={sessions.app_sessions} />
          <Stat range={range} list="with_telemetry" label="With telemetry" value={sessions.with_telemetry} sub={share(sessions.with_telemetry, sessions.app_sessions, "sessions")} />
          <Stat range={range} list="no_telemetry" label="Without telemetry" value={sessions.no_telemetry} sub={share(sessions.no_telemetry, sessions.app_sessions, "sessions")} />
        </div>
      </section>
      <section aria-labelledby="connections-title">
        <h2 id="connections-title">Client connections</h2>
        <p className="hint">Connections with telemetry. Each app session can have several.</p>
        <div className="stats health-stats">
          <Stat range={range} list="clients" label="Measured connections" value={clients.clients} />
          <Stat range={range} list="clients_connected" label="Connected" value={clients.clients_connected} sub={share(clients.clients_connected, clients.clients, "connections")} />
          <Stat range={range} list="clients_not_connected" label="Didn’t connect" value={clients.clients_not_connected} sub={share(clients.clients_not_connected, clients.clients, "connections")} />
          <Stat range={range} list="clients_unknown" label="Unknown outcome" value={clients.clients_unknown} sub={share(clients.clients_unknown, clients.clients, "connections")} />
        </div>
      </section>
    </div>
  );
}

function Stat({ range, list, label, value, sub }: { range: Range; list: CohortKey; label: string; value: string; sub?: string }) {
  return (
    <Link href={link(range, { list })} scroll={false} className="stat" data-outcome={list}>
      <div className="stat-label">{label}<span aria-hidden="true">›</span></div>
      <div className="stat-value">{formatNumber(value)}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </Link>
  );
}
