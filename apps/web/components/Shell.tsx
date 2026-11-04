"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Armchair,
  BookOpen,
  Bot,
  Building2,
  Check,
  ChevronsUpDown,
  Cpu,
  History,
  Inbox,
  LayoutGrid,
  LayoutDashboard,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Wallet,
  Workflow,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MeProvider, useMe } from "@/lib/me";
import { WorkspaceProvider, useWorkspaces, wsPath } from "@/lib/workspace";
import { useInboxCount } from "@/lib/inbox";
import { Avatar } from "./ui";

type NavItem = { href: string; label: string; icon: typeof Armchair; match: (p: string) => boolean; badge?: number };

/** The menu inside a workspace (Multica-style grouping; design only). */
const workspaceNav = (id: string): NavItem[] => {
  const base = wsPath(id);
  return [
    { href: base, label: "Overview", icon: LayoutDashboard, match: (p) => p === base },
    { href: `${base}/agent`, label: "AI Agent", icon: Sparkles, match: (p) => p.startsWith(`${base}/agent`) },
    { href: `${base}/runs`, label: "Runs", icon: History, match: (p) => p.startsWith(`${base}/runs`) },
    { href: `${base}/workflows`, label: "Workflows", icon: Workflow, match: (p) => p.startsWith(`${base}/workflows`) },
    { href: `${base}/usage`, label: "Usage", icon: Wallet, match: (p) => p.startsWith(`${base}/usage`) },
    { href: `${base}/settings`, label: "Settings", icon: Settings, match: (p) => p.startsWith(`${base}/settings`) },
  ];
};

/** Shared between workspaces. */
const LIBRARY: NavItem[] = [
  { href: "/agents", label: "Agents", icon: Bot, match: (p) => p.startsWith("/agents") },
  { href: "/skills", label: "Skills", icon: BookOpen, match: (p) => p.startsWith("/skills") },
  { href: "/runtimes", label: "Runtimes", icon: Cpu, match: (p) => p.startsWith("/runtimes") },
];
const PEOPLE: NavItem = { href: "/people", label: "People", icon: ShieldCheck, match: (p) => p.startsWith("/people") };

const ROLE_LABEL = { owner: "Owner", operator: "Operator", viewer: "Viewer" } as const;

export function Shell({ children }: { children: ReactNode }) {
  return (
    <MeProvider>
      <WorkspaceProvider>
        <Frame>{children}</Frame>
      </WorkspaceProvider>
    </MeProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "/";
  const { me, error } = useMe();
  const { current } = useWorkspaces();
  const inbox = useInboxCount();
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
  const top: NavItem[] = [
    { href: "/", label: "Workspaces", icon: LayoutGrid, match: (p) => p === "/" || p.startsWith("/workspaces") },
    { href: "/inbox", label: "Inbox", icon: Inbox, match: (p) => p.startsWith("/inbox"), badge: inbox },
  ];
  const work = current ? workspaceNav(current.id) : [];
  const library = me?.role === "owner" ? [...LIBRARY, PEOPLE] : LIBRARY;
  const all = [...top, ...work, ...library];
  const link = ({ href, label, icon: Icon, match, badge }: NavItem) => (
    <Link key={href} href={href} className={`nav-link relative ${collapsed ? "justify-center" : ""}`} data-active={match(path)} title={collapsed ? label : undefined} aria-label={label}>
      <Icon size={18} /> {!collapsed && label}
      {!!badge && (
        <span className={`nav-badge ${collapsed ? "absolute right-1 top-1" : "ml-auto"}`} aria-label={`${badge} waiting`}>
          {badge}
        </span>
      )}
    </Link>
  );
  return (
    // data-role hides the actions this role can't use (see globals.css); the server enforces the same rules.
    <div className="flex min-h-screen" data-role={(current && me?.scope?.[current.id]?.role) || me?.role}>
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r px-3 py-5 transition-[width] duration-200 md:flex ${collapsed ? "w-[68px]" : "w-60"}`}
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
      >
        <div className={`mb-5 flex ${collapsed ? "flex-col items-center gap-3" : "items-center justify-between"}`}>
          <Link href="/" className={`flex items-center gap-2 ${collapsed ? "" : "px-2"}`} title="Agent Town">
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
            className="btn btn-ghost btn-icon !h-8 !w-8"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <WorkspaceSwitcher collapsed={collapsed} />
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {top.map(link)}
          {work.length > 0 && <div className="nav-sep" />}
          {work.map(link)}
          <div className="nav-sep" />
          {!collapsed && <div className="nav-group">Library</div>}
          {library.map(link)}
        </nav>
        {!collapsed && (
          <div className="muted mt-3 px-2 text-[11px] leading-relaxed">
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
        )}
      </aside>

      {/* mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-3 md:hidden" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
          <Building2 size={18} style={{ color: "var(--accent)" }} />
          <span className="font-bold">Agent Town</span>
          <nav className="ml-auto flex gap-1 overflow-x-auto">
            {all.map(({ href, icon: Icon, label, match, badge }) => (
              <Link key={href} href={href} className="nav-link relative !h-9 shrink-0 !px-2" data-active={match(path)} aria-label={label}>
                <Icon size={18} />
                {!!badge && <span className="nav-badge absolute -right-0.5 -top-0.5">{badge}</span>}
              </Link>
            ))}
          </nav>
        </header>
        {error ? (
          <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 md:px-8 md:py-8">
            <div className="panel mx-auto mt-16 max-w-md p-8 text-center">
              <Lock size={28} className="mx-auto mb-3" style={{ color: "var(--accent)" }} />
              <p className="font-semibold">{error}</p>
            </div>
          </main>
        ) : path.startsWith("/office") ? (
          // The office is a full-bleed stage: no page padding, fills the whole viewport beside the sidebar.
          <main className="h-[calc(100vh-57px)] min-h-[480px] w-full flex-1 md:h-screen">{children}</main>
        ) : /^\/workflows\/[^/]+/.test(path) ? (
          // The workflow editor uses the whole viewport: no max width, tight padding.
          <main className="w-full min-w-0 flex-1 p-3 md:px-4 md:py-4">{children}</main>
        ) : (
          <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        )}
      </div>
    </div>
  );
}

/** The workspace switcher at the top of the sidebar. */
function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { workspaces, current } = useWorkspaces();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const main = current?.agents.find((a) => a.id === current.mainAgentId);
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  return (
    <div ref={ref} className="relative mb-3">
      <button
        className={`flex w-full items-center gap-2 rounded-xl border p-2 text-left hover:border-[var(--accent)] ${collapsed ? "justify-center" : ""}`}
        style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch workspace"
        title={collapsed ? current?.name ?? "Workspaces" : undefined}
      >
        {main ? <Avatar name={current!.name} color={main.appearance.color} sprite={main.appearance.sprite} size={28} /> : <LayoutGrid size={18} />}
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{current?.name ?? "Choose a workspace"}</span>
            <ChevronsUpDown size={15} className="muted shrink-0" />
          </>
        )}
      </button>
      {open && (
        <div role="menu" className="panel absolute left-0 top-full z-50 mt-1 w-64 p-1.5" style={{ boxShadow: "var(--shadow)" }}>
          <div className="max-h-72 overflow-y-auto">
            {(workspaces ?? []).map((w) => (
              <button key={w.id} role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-soft)]" onClick={() => go(wsPath(w.id, "agent"))}>
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
                {w.id === current?.id && <Check size={14} style={{ color: "var(--accent)" }} />}
              </button>
            ))}
          </div>
          <div className="nav-sep" />
          <button role="menuitem" data-needs="edit" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-soft)]" onClick={() => go("/workspaces/new")}>
            <Plus size={14} /> New workspace
          </button>
        </div>
      )}
    </div>
  );
}
