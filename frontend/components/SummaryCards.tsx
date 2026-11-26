import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { link } from "@/lib/links";
import { getClientCounts, getSessionCounts, type CohortKey, type Range } from "@/lib/queries";

export default async function SummaryCards({ range }: { range: Range }) {
  const [sessions, clients] = await Promise.all([getSessionCounts(range), getClientCounts(range)]);

  return (
    <div className="metric-groups">
      <section aria-labelledby="sessions-title">
        <h2 id="sessions-title">App sessions</h2>
        <p className="hint">Counted by app session start. One session can have several client connections.</p>
        <div className="metric-strip session-metrics">
          <Metric range={range} list="app_sessions" label="Total" value={sessions.app_sessions} />
          <Metric range={range} list="with_telemetry" label="With event logs" value={sessions.with_telemetry} />
          <Metric range={range} list="no_telemetry" label="Without event logs" value={sessions.no_telemetry} />
        </div>
      </section>
      <section aria-labelledby="connections-title">
        <div className="section-line metric-heading">
          <h2 id="connections-title">Client connections</h2>
          <span>One outcome per connection ID</span>
        </div>
        <p className="hint">Counted by first event. A success means a success event was logged for that ID. No success recorded does not prove a player never connected.</p>
        <div className="metric-strip client-metrics">
          <Metric range={range} list="clients" label="Total tracked" value={clients.clients} />
          <Metric range={range} list="clients_connected" label="Success recorded" value={clients.clients_connected} />
          <Metric range={range} list="clients_not_connected" label="No success recorded" value={clients.clients_not_connected} />
          <Metric range={range} list="clients_unknown" label="No outcome evidence" value={clients.clients_unknown} />
        </div>
      </section>
    </div>
  );
}

function Metric({ range, list, label, value }: { range: Range; list: CohortKey; label: string; value: string }) {
  return (
    <Link href={link(range, { list })} scroll={false} className="metric-cell">
      <strong>{formatNumber(value)}</strong>
      <span>{label}</span>
      <span className="metric-arrow" aria-hidden="true">›</span>
    </Link>
  );
}
