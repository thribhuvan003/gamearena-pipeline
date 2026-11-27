// The recorded errors and warnings in one table per unit. Counts are distinct sessions or connections, not causes.
import Link from "next/link";
import { formatNumber, recordedEventLabel, redact } from "@/lib/format";
import { link } from "@/lib/links";
import { getCohortCount, getRecordedEvents, type CohortKey, type Range, type RecordedEventRow } from "@/lib/queries";

export default async function RecordedEvents({ range, unit }: { range: Range; unit: "sessions" | "clients" }) {
  const sessions = unit === "sessions";
  const noLogs = sessions ? "session_no_diagnostic" : "client_no_diagnostic";
  const [rows, empty] = await Promise.all([getRecordedEvents(range, unit), getCohortCount(noLogs, null, range)]);
  const columns: { label: string; key: CohortKey; field: keyof RecordedEventRow }[] = sessions
    ? [
        { label: "Didn't connect", key: "session_recorded_failed", field: "failed" },
        { label: "Connected", key: "session_recorded_connected", field: "connected" },
        { label: "Not classified", key: "session_recorded_unknown", field: "unknown" },
      ]
    : [
        { label: "Didn't connect", key: "client_recorded_failed", field: "failed" },
        { label: "Before success", key: "client_recorded_before", field: "before_success" },
        { label: "At/after success", key: "client_recorded_after", field: "after_success" },
        { label: "Unknown", key: "client_recorded_unknown", field: "unknown" },
      ];
  return (
    <section className="overview-panel" aria-labelledby={unit + "-recorded-events"}>
      <h3 id={unit + "-recorded-events"}>{sessions ? "Session errors and warnings" : "Client errors and warnings"}</h3>
      <p className="hint">{sessions
        ? "Events logged without a client ID, by app session start date. Client-ID events are shown below."
        : "Events with a tracked client ID, by first event day. Before and at/after success can include the same connection."} Counts are distinct {sessions ? "sessions" : "client connections"}; rows can overlap. A logged event is not necessarily the cause.</p>
      <div className="card-body" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-small)" }}>
          <thead><tr><th scope="col" style={{ textAlign: "left" }}>Recorded event and payload</th>{columns.map((col) => <th scope="col" key={col.key} style={{ textAlign: "right", padding: "8px" }}>{col.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.signature} style={{ borderTop: "1px solid var(--separator)" }}>
              <th scope="row" style={{ textAlign: "left", fontWeight: "normal", padding: "8px 4px", overflowWrap: "anywhere" }}>
                <strong>{recordedEventLabel(row.signature)}</strong>
                {row.detail && <span className="row-meta">Most common text: {redact(row.detail)}</span>}
                <span className="row-meta">{formatNumber(row.events)} events logged</span>
              </th>
              {columns.map((col) => {
                const value = row[col.field] ?? "0";
                return <td key={col.key} style={{ textAlign: "right", padding: "8px", whiteSpace: "nowrap" }}>
                  {Number(value) > 0 ? <Link href={link(range, { list: col.key, arg: row.signature })} scroll={false}>{formatNumber(value)}</Link> : "0"}
                </td>;
              })}
            </tr>)}
            <tr style={{ borderTop: "1px solid var(--separator)" }}>
              <th scope="row" style={{ textAlign: "left", padding: "8px 4px" }}>No error or warn event {sessions ? "without a client ID" : "for this client"}</th>
              <td style={{ textAlign: "right", padding: "8px" }}>{Number(empty) > 0 ? <Link href={link(range, { list: noLogs })} scroll={false}>{formatNumber(empty)}</Link> : "0"}</td>
              {columns.slice(1).map((col) => <td key={col.key} style={{ textAlign: "right", padding: "8px" }}>—</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
