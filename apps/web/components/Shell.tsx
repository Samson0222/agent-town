"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, History, Sparkles, Users, Workflow, Armchair, Bot, BookOpen, ShieldCheck, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { MeProvider, useMe } from "@/lib/me";

const NAV = [
  { href: "/office", label: "Office", icon: Armchair, match: (p: string) => p.startsWith("/office") },
  { href: "/", label: "Start", icon: Sparkles, match: (p: string) => p === "/" },
  { href: "/runs", label: "Runs", icon: History, match: (p: string) => p.startsWith("/runs") },
  { href: "/agents", label: "Agents", icon: Bot, match: (p: string) => p.startsWith("/agents") },
  { href: "/skills", label: "Skills", icon: BookOpen, match: (p: string) => p.startsWith("/skills") },
  { href: "/teams", label: "Teams", icon: Users, match: (p: string) => p.startsWith("/teams") },
  { href: "/workflows", label: "Workflows", icon: Workflow, match: (p: string) => p.startsWith("/workflows") },
];
const PEOPLE = { href: "/people", label: "People", icon: ShieldCheck, match: (p: string) => p.startsWith("/people") };

const ROLE_LABEL = { owner: "Owner", operator: "Operator", viewer: "Viewer" } as const;

export function Shell({ children }: { children: ReactNode }) {
  return (
    <MeProvider>
      <Frame>{children}</Frame>
    </MeProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "/";
  const { me, error } = useMe();
  const nav = me?.role === "owner" ? [...NAV, PEOPLE] : NAV;
  return (
    // data-role hides the actions this role can't use (see globals.css); the server enforces the same rules.
    <div className="flex min-h-screen" data-role={me?.role}>
      <aside
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r px-3 py-5 md:flex"
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
      >
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl text-white" style={{ background: "linear-gradient(135deg, var(--accent), #ff7ab6)" }}>
            <Building2 size={20} />
          </span>
          <span>
            <span className="block text-[15px] font-bold leading-tight">Agent Town</span>
            <span className="muted block text-[11px]">your AI office</span>
          </span>
        </Link>
        <nav className="flex flex-col gap-1">
          {nav.map(({ href, label, icon: Icon, match }) => (
            <Link key={href} href={href} className="nav-link" data-active={match(path)}>
              <Icon size={18} /> {label}
            </Link>
          ))}
        </nav>
        <div className="muted mt-auto px-2 text-[11px] leading-relaxed">
          {me && !me.local ? (
            <>
              <span className="block truncate" title={me.email}>
                {me.email}
              </span>
              {ROLE_LABEL[me.role]}
            </>
          ) : me?.local ? (
            "This computer"
          ) : null}
        </div>
      </aside>

      {/* mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-3 md:hidden" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
          <Building2 size={18} style={{ color: "var(--accent)" }} />
          <span className="font-bold">Agent Town</span>
          <nav className="ml-auto flex gap-1">
            {nav.map(({ href, icon: Icon, label, match }) => (
              <Link key={href} href={href} className="nav-link !h-9 !px-2" data-active={match(path)} aria-label={label}>
                <Icon size={18} />
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 md:px-8 md:py-8">
          {error ? (
            <div className="panel mx-auto mt-16 max-w-md p-8 text-center">
              <Lock size={28} className="mx-auto mb-3" style={{ color: "var(--accent)" }} />
              <p className="font-semibold">{error}</p>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
