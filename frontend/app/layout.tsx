// layout.tsx: the HTML frame around every page (title, CSS).

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GameArena",
  description: "Session and connection outcomes from the GameArena pipeline",
};

export default function RootLayout({ children }: LayoutProps<"/">) {   // Wraps each page in <html> and <body>
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
