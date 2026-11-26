// Pager.tsx: "1–50 of 1,279" with Previous and Next links, for any paged list.

import Link from "next/link";
import type { ComponentProps } from "react";
import { formatNumber } from "@/lib/format";

export default function Pager({ page, size, shown, total, href }: { page: number; size: number; shown: number; total: number; href: (page: number) => ComponentProps<typeof Link>["href"] }) {   // Shows which rows of how many are on this page; Previous from past the end goes to the last page. Called by the sheet's lists and the session timeline
  const last = Math.max(0, Math.ceil(total / size) - 1);
  const from = page * size;
  return (
    <div className="pager">
      <span>{shown > 0 ? `${formatNumber(String(from + 1))}–${formatNumber(String(from + shown))}` : "0"} of {formatNumber(String(total))}</span>
      <span>
        {page > 0 ? <Link href={href(Math.min(page - 1, last))} scroll={false}>‹ Previous</Link> : <span className="muted">‹ Previous</span>}
        {" · "}
        {page < last ? <Link href={href(page + 1)} scroll={false}>Next ›</Link> : <span className="muted">Next ›</span>}
      </span>
    </div>
  );
}
