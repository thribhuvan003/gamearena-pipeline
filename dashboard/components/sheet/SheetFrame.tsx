"use client";
// SheetFrame.tsx: the side sheet as a modal dialog: focus moves into it and back, Tab stays inside it, Escape closes it, and the page behind it is inert.

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE = "a[href], button, input, summary, [tabindex]:not([tabindex='-1'])";

export default function SheetFrame({ closeHref, label, stepKey, children }: { closeHref: string; label: string; stepKey: string; children: ReactNode }) {   // Wraps the backdrop and the sheet in a dialog. Called by Sheet; the only client JS besides the chart, because focus and keys need the browser. stepKey changes with every new step or page
  const frame = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {   // Makes the page inert and remembers what had focus; undoes both when the sheet closes. Run by React once when the sheet opens
    const wrapper = frame.current!;
    const before = document.activeElement as HTMLElement | null;
    const page = Array.from(wrapper.parentElement!.children).filter((el) => el !== wrapper);
    page.forEach((el) => el.setAttribute("inert", ""));
    return () => {
      page.forEach((el) => el.removeAttribute("inert"));
      before?.focus();
    };
  }, []);

  useEffect(() => {   // Scrolls the sheet to the top and focuses it, so each new step or page starts at its beginning. Run by React when the sheet opens and on each new step or page
    const sheet = frame.current?.querySelector<HTMLElement>(".sheet");
    if (!sheet) return;
    sheet.scrollTop = 0;
    sheet.focus();
  }, [stepKey]);

  useEffect(() => {   // Listens for Escape and Tab while the sheet is open. Run by React when the sheet opens
    function onKey(event: KeyboardEvent) {   // Escape goes to closeHref; Tab or Shift+Tab past the sheet's last or first control wraps around. Called by the browser on every key press
      const sheet = frame.current?.querySelector<HTMLElement>(".sheet");
      if (event.key === "Escape") router.push(closeHref, { scroll: false });
      if (event.key !== "Tab" || !sheet) return;
      const items = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest("details:not([open]) > :not(summary)"));
      const at = document.activeElement;
      const edge = event.shiftKey ? at === items[0] || at === sheet : at === items[items.length - 1];
      if (edge || !sheet.contains(at)) {
        event.preventDefault();
        (event.shiftKey ? items[items.length - 1] : items[0])?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeHref, router]);

  return <div ref={frame} role="dialog" aria-modal="true" aria-label={label}>{children}</div>;
}
