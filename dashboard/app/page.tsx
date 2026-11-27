// page.tsx: the dashboard: header, then Sessions, Clients and Trends, then the side sheet when open.

import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import ClientConnectionErrors from "@/components/overview/ClientConnectionErrors";
import ClientLabels from "@/components/overview/ClientLabels";
import ConnectionTrend from "@/components/trends/ConnectionTrend";
import DateFilter from "@/components/header/DateFilter";
import SearchBox from "@/components/header/SearchBox";
import SessionFailures from "@/components/overview/SessionFailures";
import Sheet from "@/components/sheet/Sheet";
import SignOut from "@/components/auth/SignOut";
import SummaryCards from "@/components/overview/SummaryCards";
import ThemeToggle from "@/components/header/ThemeToggle";
import { requireDashboardAccess } from "@/lib/auth/access";
import { localPreview } from "@/lib/auth/policy";
import { linkString, readSheet, searchPrefix } from "@/lib/links";
import { searchIds, type Range } from "@/lib/queries";

export default function Home({ searchParams }: PageProps<"/">) {          // Lays out the page. Next.js calls it on every visit to /
  return (
    <main>
      <Suspense fallback={<div className="page-head"><h1>GameArena</h1><p className="hint">Loading…</p></div>}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/">, "searchParams">) {   // Reads dates and sheet state from the URL, opens a single search match, and renders the view
  await connection();
  await requireDashboardAccess();
  const params = await searchParams;
  const range: Range = {
    from: readDate(params.from),
    to: readDate(params.to),
  };
  const sheet = readSheet(params);
  const prefix = sheet.session ? null : searchPrefix(sheet.q);
  const found = prefix ? await searchIds(prefix) : [];
  if (found.length === 1) redirect(linkString(range, { session: found[0].session_id, client: found[0].kind === "client" ? found[0].id : undefined }));

  return (
    <>
      <header className="dashboard-header">
        <div className="page-head">
          <h1>GameArena</h1>
          <nav className="dashboard-nav" aria-label="Account and theme">
            {!localPreview() && <SignOut />}
            <ThemeToggle />
          </nav>
        </div>
        <div className="dashboard-tools">
          <DateFilter range={range} />
          <SearchBox range={range} q={sheet.q} />
        </div>
      </header>
      <SummaryCards range={range} unit="sessions" />
      <SessionFailures range={range} />
      <SummaryCards range={range} unit="clients" />
      <ClientConnectionErrors range={range} />
      <div className="card-grid">
        <ClientLabels range={range} title="Clients by device and OS" kinds={["device", "os"]} />
        <ClientLabels range={range} title="Clients by browser and access" kinds={["browser", "access"]} />
      </div>
      <section className="metric-groups" aria-labelledby="trends-title">
        <h2 id="trends-title">Trends</h2>
      </section>
      <ConnectionTrend range={range} />
      {(sheet.list || sheet.session || sheet.q) && <Suspense fallback={<><div className="sheet-backdrop" /><div className="sheet"><p className="hint">Loading…</p></div></>}><Sheet range={range} sheet={sheet} /></Suspense>}
    </>
  );
}

function readDate(value: string | string[] | undefined): string | null {   // A real calendar day like 2026-10-01, else null (2026-02-31 doesn't read back the same)
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}
