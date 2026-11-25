import Link from "next/link";
import { eventLabel, formatNumber } from "@/lib/format";
import { link } from "@/lib/links";
import { getErrorFrequency, getUntiedErrors, type Range } from "@/lib/queries";

export default async function TopErrors({ range }: { range: Range }) {
  const [clientErrors, sessionErrors] = await Promise.all([getErrorFrequency(range), getUntiedErrors(range)]);
  const clients = clientErrors.filter((row) => !row.warning && Number(row.clients) > 0)
    .sort((a, b) => Number(b.clients) - Number(a.clients));
  const sessions = sessionErrors.filter((row) => Number(row.sessions) > 0 &&
    !row.error.startsWith("ice.candidate.error"));
  // Compare counts within one unit. If no error names a measured client, use app sessions instead.
  const cards = clients.length
    ? clients.slice(0, 3).map((row) => ({ key: row.error, count: row.clients, list: "client_error" }))
    : sessions.slice().sort((a, b) => Number(b.sessions) - Number(a.sessions))
      .slice(0, 3).map((row) => ({ key: row.error, count: row.sessions, list: "untied_error" }));
  const unit = clients.length ? "client connections" : "app sessions";

  return (
    <section className="top-errors" aria-labelledby="top-errors-title">
      <div className="section-line">
        <h2 id="top-errors-title">Most recorded errors</h2>
        <Link href={link({ ...range, view: "diagnostics" })}>All diagnostics</Link>
      </div>
      {cards.length === 0 ? <p className="hint">No errors tied to measured connections or app sessions in this period.</p> : (
        <>
          <p className="hint">Ranked by the number of {unit} with each error.</p>
          <div className="stats health-stats session-stats">
            {cards.map(({ key, count, list }) => (
              <Link key={key} href={link(range, { list, arg: key })} scroll={false} className="stat">
                <div className="stat-label">{eventLabel(key)}<span aria-hidden="true">›</span></div>
                <div className="stat-value">{formatNumber(count)}</div>
                <div className="stat-sub">{unit}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
