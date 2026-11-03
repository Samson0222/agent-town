import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Town",
  description: "A visual office for your own agent teams and workflows.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
          <nav className="mx-auto flex max-w-[1400px] items-center gap-6 px-4 py-3 text-sm">
            <Link href="/" className="font-bold tracking-tight">
              🏘️ Agent Town
            </Link>
            <Link href="/" className="muted hover:underline">Runs</Link>
            <Link href="/teams" className="muted hover:underline">Teams</Link>
            <Link href="/workflows" className="muted hover:underline">Workflows</Link>
            <span className="muted ml-auto text-xs">localhost prototype · v0.3</span>
          </nav>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
