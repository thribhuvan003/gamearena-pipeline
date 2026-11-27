// SessionFailures.tsx: sessions that didn't connect, each counted once: by the errors they logged with no client ID,
// then those with errors only on a client, then those with none. The rows add up.

import Link from "next/link";
import { eventLabel, formatNumber, redact } from "@/lib/format";
import { link } from "@/lib/links";
import { getFailedSessionCombos, getFailedSessionErrors, getSessionCounts, type Range } from "@/lib/queries";

export default async function SessionFailures({ range }: { range: Range }) {   // One list that adds up to the sessions that didn't connect; every row opens its sessions
  const [counts, combos, errors] = await Promise.all([getSessionCounts(range), getFailedSessionCombos(range), getFailedSessionErrors(range)]);
  const message = new Map(errors.map((row) => [row.error, row.detail]));
  const rows = [
    ...combos.map((row) => {
      const parts = row.combo.split(" + ");
      return {
        key: row.combo, to: { list: "failed_session_errors" as const, arg: row.combo }, count: row.sessions,
        label: (parts.length > 1 ? "Both " : "") + parts.map(eventLabel).join(" and "),
        meta: parts.length === 1 && message.get(parts[0]) ? `most common message: ${redact(message.get(parts[0])!)}` : "",
      };
    }),
    { key: "client", to: { list: "failed_client_error_only" as const, arg: undefined }, count: counts.failed_client_error_only, label: "Errors only with a client ID (see Clients)", meta: "" },
    { key: "none", to: { list: "failed_no_error" as const, arg: undefined }, count: counts.failed_no_error, label: "No error-level event logged", meta: "" },
  ];

  return (
    <section className="overview-panel" aria-labelledby="session-failures-title">
      <h3 id="session-failures-title">{formatNumber(counts.tag_failed)} sessions didn&apos;t connect</h3>
      <p className="hint">Each session once, by the errors it logged with no client ID; the rows add up to {formatNumber(counts.tag_failed)}.</p>
      <ul className="list reason-list">
        {rows.map((row) => (
          <li key={row.key}>
            <Link href={link(range, row.to)} scroll={false} className="list-row">
              <span className="row-main">
                <strong>{row.label}</strong>
                {row.meta && <span className="row-meta">{row.meta}</span>}
              </span>
              <span className="row-end"><strong>{formatNumber(row.count)}</strong></span>
              <span className="chevron" aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
