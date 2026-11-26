// page.tsx: the dashboard: header, then Overview or Diagnostics, then the side sheet when one is open.

import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import ClientErrorTrend from "@/components/diagnostics/ClientErrorTrend";
import ClientErrors from "@/components/diagnostics/ClientErrors";
import ClientReasons from "@/components/overview/ClientReasons";
import ConnectionTrend from "@/components/overview/ConnectionTrend";
import DateFilter from "@/components/header/DateFilter";
import NoClientErrors from "@/components/overview/NoClientErrors";
import SearchBox from "@/components/header/SearchBox";
import SessionPatterns from "@/components/diagnostics/SessionPatterns";
import Sheet from "@/components/sheet/Sheet";
import SignOut from "@/components/auth/SignOut";
import SummaryCards from "@/components/overview/SummaryCards";
import ThemeToggle from "@/components/header/ThemeToggle";
import { requireDashboardAccess } from "@/lib/auth/access";
import { localPreview } from "@/lib/auth/policy";
import { link, linkString, readSheet, searchPrefix } from "@/lib/links";
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
    view: params.view === "diagnostics" ? "diagnostics" : undefined,
  };
  const diagnostics = range.view === "diagnostics";
  const sheet = readSheet(params);
  const prefix = sheet.session ? null : searchPrefix(sheet.q);
  const found = prefix ? await searchIds(prefix) : [];
  if (found.length === 1) redirect(linkString(range, { session: found[0].session_id, client: found[0].kind === "client" ? found[0].id : undefined }));

  return (
    <>
      <header className="dashboard-header">
        <div className="page-head">
          <h1>GameArena</h1>
          <nav className="dashboard-nav" aria-label="Dashboard views">
            <Link href={link({ ...range, view: undefined })} aria-current={!diagnostics ? "page" : undefined}>Overview</Link>
            <Link href={link({ ...range, view: "diagnostics" })} aria-current={diagnostics ? "page" : undefined}>Diagnostics</Link>
            {!localPreview() && <SignOut />}
            <ThemeToggle />
          </nav>
        </div>
        <div className="dashboard-tools">
          <DateFilter range={range} />
          <SearchBox range={range} q={sheet.q} />
        </div>
      </header>
      {diagnostics ? (
        <>
          <div className="diagnostics-content">
            <div className="view-heading">
              <h2>Diagnostics</h2>
              <p className="hint">A session can have several clients. Connected = the app logged pipeline.connect.success.</p>
            </div>
            <SessionPatterns range={range} />
            <ClientErrors range={range} />
            <ClientErrorTrend range={range} />
          </div>
        </>
      ) : (
        <>
          <SummaryCards range={range} />
          <div className="overview-grid">
            <ClientReasons range={range} sheet={sheet} />
            <ConnectionTrend range={range} />
          </div>
          <NoClientErrors range={range} />
        </>
      )}
      {(sheet.list || sheet.session || sheet.q) && <Suspense fallback={<><div className="sheet-backdrop" /><div className="sheet"><p className="hint">Loading…</p></div></>}><Sheet range={range} sheet={sheet} /></Suspense>}
    </>
  );
}

function readDate(value: string | string[] | undefined): string | null {   // A real calendar day like 2026-10-01, else null (2026-02-31 doesn't read back the same)
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}
