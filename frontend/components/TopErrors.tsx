import Link from "next/link";
import { formatNumber, overviewErrorLabel } from "@/lib/format";
import { link } from "@/lib/links";
import { getTopSessionErrors, type Range } from "@/lib/queries";

export default async function TopErrors({ range }: { range: Range }) {
  const errors = await getTopSessionErrors(range);

  return (
    <section className="top-errors" aria-labelledby="top-errors-title">
      <div className="section-line">
        <h2 id="top-errors-title">Logged error events</h2>
      </div>
      <p className="hint">Distinct app sessions containing each error by event day (UTC), including sessions with a success. Events can repeat; Code 500 is an app-reported value, not a confirmed cause.</p>
      {errors.length === 0 ? <p className="hint">No errors recorded in app sessions during these dates.</p> : (
        <div className="list overview-errors">
          <div className="overview-error-row overview-error-labels" aria-hidden="true">
            <span>Error</span>
            <span>Affected sessions</span>
            <span>Times recorded</span>
            <span />
          </div>
          {errors.map(({ error, sessions, events }) => {
            const label = overviewErrorLabel(error);
            return (
              <Link
                key={error} href={link(range, { list: "recorded_error", arg: error })}
                scroll={false} className="list-row overview-error-row"
                aria-label={`${label}, ${formatNumber(sessions)} affected sessions, recorded ${formatNumber(events)} times`}
              >
                <span>{label}</span>
                <strong>{formatNumber(sessions)}</strong>
                <span>{formatNumber(events)}</span>
                <span className="chevron" aria-hidden="true">›</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
