// layout.tsx: the HTML frame around every page (title, CSS).

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GameArena",
  description: "Session and connection outcomes from the GameArena pipeline",
};

// Runs before the page paints: applies the light / dark choice saved by ThemeToggle, so the page never flashes the other theme.
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {   // Wraps each page in <html> and <body>, with the saved theme applied first. suppressHydrationWarning: the script sets data-theme on <html> before React loads
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
