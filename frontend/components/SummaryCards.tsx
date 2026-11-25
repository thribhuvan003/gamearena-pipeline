import Link from "next/link";
import { formatNumber, percent } from "@/lib/format";
import { link } from "@/lib/links";
import { getClientCounts, getSessionCounts, type CohortKey, type Range } from "@/lib/queries";

export default async function SummaryCards({ range }: { range: Range }) {
  const [sessions, clients] = await Promise.all([getSessionCounts(range), getClientCounts(range)]);
  const clientShare = (value: string) => Number(clients.clients) > 0
    ? `${percent(value, clients.clients)}% of measured connections`
    : undefined;

  return (
    <section aria-labelledby="health-title">
      <h2 id="health-title">Connection health</h2>
      <p className="hint">An app session can have several client connections.</p>
      <div className="stats health-stats">
        <Stat range={range} list="app_sessions" label="App sessions" value={sessions.app_sessions} sub="All sessions in this period" />
        <Stat range={range} list="clients" label="Measured connections" value={clients.clients} sub="Client connections with telemetry" />
        <Stat range={range} list="clients_connected" label="Connected" value={clients.clients_connected} sub={clientShare(clients.clients_connected)} />
        <Stat range={range} list="clients_not_connected" label="Didn’t connect" value={clients.clients_not_connected} sub={clientShare(clients.clients_not_connected)} />
      </div>
      <div className="coverage">
        <div>
          <strong>Session data coverage</strong>
          <span>
            <Link href={link(range, { list: "with_telemetry" })} scroll={false}>{formatNumber(sessions.with_telemetry)} with telemetry</Link>
            {" · "}
            <Link href={link(range, { list: "no_telemetry" })} scroll={false}>{formatNumber(sessions.no_telemetry)} without telemetry</Link>
          </span>
        </div>
        {Number(clients.clients_unknown) > 0 && (
          <Link href={link(range, { list: "clients_unknown" })} scroll={false}>{formatNumber(clients.clients_unknown)} connections with unknown outcomes</Link>
        )}
      </div>
    </section>
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
