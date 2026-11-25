// SummaryCards.tsx: the totals for sessions and for client connections, one card per number.

import { formatNumber } from "@/lib/format";
import { getConnectionSummary, getSessionSummary, type Range } from "@/lib/queries";

export default async function SummaryCards({ range }: { range: Range }) {   // Reads both summaries for the range and shows two rows of cards. Called by the dashboard page, first section
  const [sessions, connections] = await Promise.all([getSessionSummary(range), getConnectionSummary(range)]);

  return (
    <section>
      <h2>Sessions</h2>
      <div className="cards">
        <Card label="Sessions" value={formatNumber(sessions.sessions)} note="ended sessions tagged" />
        <Card label="Connected" value={formatNumber(sessions.connected)} note={`${sessions.connected_percent ?? 0}% of sessions`} />
        <Card label="Failed" value={formatNumber(sessions.failed)} note="tried, no success" />
        <Card label="No attempt" value={formatNumber(sessions.no_attempt)} note="no attempt recorded" />
      </div>

      <h2>Client connections</h2>
      <div className="cards">
        <Card label="Client connections" value={formatNumber(connections.client_connections)} note="one session can have several" />
        <Card label="Connected" value={formatNumber(connections.connected)} note={`${connections.connected_percent ?? 0}% of connections`} />
        <Card label="Not connected" value={formatNumber(connections.not_connected)} note="app events, no success" />
        <Card label="Unknown" value={formatNumber(connections.unknown)} note="no app events" />
      </div>
    </section>
  );
}

function Card({ label, value, note }: { label: string; value: string; note: string }) {   // One box: label, big number, small note. Called by SummaryCards above for each total
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className="card-value">{value}</div>
      <div className="card-note">{note}</div>
    </div>
  );
}
