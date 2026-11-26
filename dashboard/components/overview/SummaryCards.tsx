// SummaryCards.tsx: the headline numbers: app sessions and client connections, each opening exactly its records.

import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { link } from "@/lib/links";
import { getClientCounts, getSessionCounts, type CohortKey, type Range } from "@/lib/queries";

export default async function SummaryCards({ range }: { range: Range }) {   // Reads both cohort counts and shows the session strip, then the client connection strip. Called by the overview
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
        <p className="hint">Counted by first event. Connected = the app logged pipeline.connect.success for that client.</p>
        <div className="metric-strip client-metrics">
          <Metric range={range} list="clients" label="Total tracked" value={clients.clients} />
          <Metric range={range} list="clients_connected" label="Connected" value={clients.clients_connected} />
          <Metric range={range} list="clients_not_connected" label="Didn't connect" value={clients.clients_not_connected} />
          <Metric range={range} list="clients_unknown" label="Unknown" value={clients.clients_unknown} />
        </div>
      </section>
    </div>
  );
}

function Metric({ range, list, label, value }: { range: Range; list: CohortKey; label: string; value: string }) {   // One headline number as a link to exactly its records. Called by SummaryCards
  return (
    <Link href={link(range, { list })} scroll={false} className="metric-cell">
      <strong>{formatNumber(value)}</strong>
      <span>{label}</span>
      <span className="metric-arrow" aria-hidden="true">›</span>
    </Link>
  );
}
