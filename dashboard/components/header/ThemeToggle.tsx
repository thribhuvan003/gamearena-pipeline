"use client";
// ThemeToggle.tsx: the light / dark switch in the header; the choice is kept in this browser.

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function currentTheme(): Theme {   // The theme on screen now: the switch's choice if any, else the system setting. Called by ThemeToggle when it first shows
  const picked = document.documentElement.dataset.theme;
  if (picked === "light" || picked === "dark") return picked;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function ThemeToggle() {   // Flips light / dark and remembers it in this browser
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => setTheme(currentTheme()), []);

  function flip() {   // Switches to the other theme, on the page and in localStorage (skipped if the browser blocks storage). Called when the button is clicked
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
    setTheme(next);
  }

  if (theme === null) return null;
  return (
    <button type="button" className="theme-toggle" onClick={flip} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
      {theme === "dark" ? "☀ Light" : "☾ Dark"}
    </button>
  );
}
