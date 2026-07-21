import type { Metadata } from "next";
import Script from "next/script";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { themeInitScript } from "@/lib/theme";

// Geist is loaded from the self-hosted `geist` package (bundled .woff2 files),
// not `next/font/google`. That avoids the build/dev-time Google Fonts fetch that
// turbopack can't resolve offline/behind a proxy (the
// "@vercel/turbopack-next/internal/font/google/font" error). Same CSS variables
// (--font-geist-sans / --font-geist-mono) that globals.css already references.

export const metadata: Metadata = {
  title: "NIBBS Settlement Auditor",
  description:
    "Automated verification of NIBBS net-settlement files before submission — reconciliation and breach escalation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Pre-paint theme class (avoids a light/dark flash). Injected via
            next/script `beforeInteractive` — the sanctioned way to run an inline
            script before hydration; a raw <script> in the tree trips React 19's
            "script inside a React component" warning. */}
        <Script
          id="nibbs-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        {children}
      </body>
    </html>
  );
}
