// page.tsx: the dashboard at http://localhost:3000. Date filter, then the numbers, the reasons and errors, the daily error chart, and the sessions behind a clicked reason.

import { Suspense } from "react";
import DateFilter from "@/components/DateFilter";
import ErrorTable from "@/components/ErrorTable";
import ErrorTrend from "@/components/ErrorTrend";
import ReasonsTable from "@/components/ReasonsTable";
import SessionList from "@/components/SessionList";
import SummaryCards from "@/components/SummaryCards";
import type { Range } from "@/lib/queries";

export default function Home({ searchParams }: PageProps<"/">) {          // Lays out the page. Next.js calls it on every visit to /
  return (
    <main>
      <h1>GameArena</h1>
      <p className="hint">Results of the GameArena pipeline, read live from the database on every page load.</p>
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/">, "searchParams">) {   // Reads the date range (?from=&to=) and the clicked reason (?reason=) from the URL, and shows every section for that range. Called by Home inside <Suspense>, because the URL is only known when someone visits
  const params = await searchParams;
  const range: Range = { from: day(params.from), to: day(params.to) };
  const reason = typeof params.reason === "string" ? params.reason : undefined;

  return (
    <>
      <DateFilter range={range} />
      <SummaryCards range={range} />
      <ReasonsTable selected={reason} range={range} />
      {reason && <SessionList reason={reason} range={range} />}
      <ErrorTable range={range} />
      <ErrorTrend range={range} />
    </>
  );
}

function day(value: string | string[] | undefined): string | null {   // Keeps a URL value only if it is a real date like 2026-10-01, else null (no limit). Called by Dashboard for ?from= and ?to=
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
}
