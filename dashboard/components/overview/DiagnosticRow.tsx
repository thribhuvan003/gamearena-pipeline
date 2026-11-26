// DiagnosticRow.tsx: one evidence row: a name and its count; opens its records (the sheet shows the row's logic).

import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { link, type Sheet } from "@/lib/links";
import type { Range } from "@/lib/queries";

export default function DiagnosticRow({ range, sheet, label, count }: { range: Range; sheet: Sheet; label: string; count: string }) {   // The row as a link to exactly its records
  return (
    <Link href={link(range, sheet)} scroll={false} className="list-row">
      <span className="row-main">{label}</span>
      <span className="row-end"><strong>{formatNumber(count)}</strong></span>
      <span className="chevron" aria-hidden="true">›</span>
    </Link>
  );
}
