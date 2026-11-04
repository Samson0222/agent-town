"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, History, Sparkles, Users, Workflow, Armchair, Bot, BookOpen, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

const NAV = [
  { href: "/office", label: "Office", icon: Armchair, match: (p: string) => p.startsWith("/office") },
  { href: "/", label: "Start", icon: Sparkles, match: (p: string) => p === "/" },
  { href: "/runs", label: "Runs", icon: History, match: (p: string) => p.startsWith("/runs") },
  { href: "/agents", label: "Agents", icon: Bot, match: (p: string) => p.startsWith("/agents") },
  { href: "/skills", label: "Skills", icon: BookOpen, match: (p: string) => p.startsWith("/skills") },
  { href: "/teams", label: "Teams", icon: Users, match: (p: string) => p.startsWith("/teams") },
  { href: "/workflows", label: "Workflows", icon: Workflow, match: (p: string) => p.startsWith("/workflows") },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "/";
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("agent-town:sidebar") === "collapsed");
    } catch {}
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("agent-town:sidebar", c ? "open" : "collapsed");
      } catch {}
      return !c;
    });
  };
  return (
    <div className="flex min-h-screen">
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r px-3 py-5 transition-[width] duration-200 md:flex ${collapsed ? "w-[68px]" : "w-60"}`}
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
      >
        <Link href="/" className={`mb-4 flex items-center gap-2 ${collapsed ? "justify-center" : "px-2"}`} title="Agent Town">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl text-white" style={{ background: "linear-gradient(135deg, var(--accent), #ff7ab6)" }}>
            <Building2 size={20} />
          </span>
          {!collapsed && (
            <span>
              <span className="block text-[15px] font-bold leading-tight">Agent Town</span>
              <span className="muted block text-[11px]">your AI office</span>
            </span>
          )}
        </Link>
        <button
          className={`nav-link mb-2 ${collapsed ? "justify-center" : ""}`}
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && "Collapse"}
        </button>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon, match }) => (
            <Link key={href} href={href} className={`nav-link ${collapsed ? "justify-center" : ""}`} data-active={match(path)} title={collapsed ? label : undefined} aria-label={label}>
              <Icon size={18} /> {!collapsed && label}
            </Link>
          ))}
        </nav>
        {!collapsed && (
          <div className="muted mt-auto px-2 text-[11px] leading-relaxed">
            Local prototype · v0.3
            <br />
            Runs only on this computer.
          </div>
        )}
      </aside>

      {/* mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-3 md:hidden" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
          <Building2 size={18} style={{ color: "var(--accent)" }} />
          <span className="font-bold">Agent Town</span>
          <nav className="ml-auto flex gap-1">
            {NAV.map(({ href, icon: Icon, label, match }) => (
              <Link key={href} href={href} className="nav-link !h-9 !px-2" data-active={match(path)} aria-label={label}>
                <Icon size={18} />
              </Link>
            ))}
          </nav>
        </header>
        {path.startsWith("/office") ? (
          // The office is a full-bleed stage: no page padding, fills the whole viewport beside the sidebar.
          <main className="h-[calc(100vh-57px)] min-h-[480px] w-full flex-1 md:h-screen">{children}</main>
        ) : (
          <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        )}
      </div>
    </div>
  );
}
