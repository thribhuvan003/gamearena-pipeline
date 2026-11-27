// SummaryCards.tsx: the headline numbers of one unit (app sessions or client connections), each opening exactly its records.

import Link from "next/link";
import { formatNumber, percent } from "@/lib/format";
import { link } from "@/lib/links";
import { getClientCounts, getSessionCounts, type CohortKey, type Range } from "@/lib/queries";

export default async function SummaryCards({ range, unit }: { range: Range; unit: "sessions" | "clients" }) {   // The section title, its share line and its strip of numbers
  if (unit === "sessions") {
    const sessions = await getSessionCounts(range);
    return (
      <section className="metric-groups" aria-labelledby="sessions-title">
        <h2 id="sessions-title">Sessions</h2>
        <p className="hint">Connected = a client in it logged pipeline.connect.success; didn&apos;t connect = an attempt logged, no success.</p>
        <p className="headline-share"><strong>{percent(sessions.with_telemetry, sessions.app_sessions)}%</strong> of app sessions have telemetry ({formatNumber(sessions.with_telemetry)} of {formatNumber(sessions.app_sessions)}).</p>
        <div className="metric-strip session-metrics">
          <Metric range={range} list="app_sessions" label="Total" value={sessions.app_sessions} />
          <Metric range={range} list="tag_connected" label="Connected" value={sessions.tag_connected} />
          <Metric range={range} list="tag_failed" label="Didn't connect" value={sessions.tag_failed} />
          <Metric range={range} list="no_outcome" label="No outcome" value={sessions.no_outcome} />
        </div>
        <p className="hint outcome-split">
          No outcome: <Link href={link(range, { list: "no_telemetry" })} scroll={false}>{formatNumber(sessions.no_telemetry)} no telemetry</Link>
          {" · "}<Link href={link(range, { list: "no_end_event" })} scroll={false}>{formatNumber(sessions.no_end_event)} no session_ended yet</Link>
          {" · "}<Link href={link(range, { list: "tag_no_attempt" })} scroll={false}>{formatNumber(sessions.tag_no_attempt)} no attempt logged</Link>
        </p>
      </section>
    );
  }
  const clients = await getClientCounts(range);
  return (
    <section className="metric-groups" aria-labelledby="clients-title">
      <h2 id="clients-title">Clients</h2>
      <p className="hint">Didn&apos;t connect = no pipeline.connect.success recorded for the client.</p>
      <p className="headline-share"><strong>{percent(clients.clients_connected, clients.clients)}%</strong> of tracked client connections connected ({formatNumber(clients.clients_connected)} of {formatNumber(clients.clients)}).</p>
      <div className="metric-strip client-metrics">
        <Metric range={range} list="clients" label="Total tracked" value={clients.clients} />
        <Metric range={range} list="clients_connected" label="Connected" value={clients.clients_connected} />
        <Metric range={range} list="clients_not_connected" label="Didn't connect" value={clients.clients_not_connected} />
        <Metric range={range} list="clients_unknown" label="Unknown (no app events)" value={clients.clients_unknown} />
      </div>
    </section>
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
