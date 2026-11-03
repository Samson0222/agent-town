"use client";
import { Globe, Users } from "lucide-react";
import type { AgentTemplate } from "@agent-town/core";
import { Avatar } from "./ui";

export interface ScopeValue {
  scope: "global" | "agents";
  agentIds: string[];
}

/** "Who gets it?" — global (all agents, can be switched off per agent) or specific agents. */
export function SkillScopePicker({ value, onChange, agents }: { value: ScopeValue; onChange: (v: ScopeValue) => void; agents: AgentTemplate[] }) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">Who gets it?</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <ScopeCard
          on={value.scope === "global"}
          onClick={() => onChange({ ...value, scope: "global" })}
          icon={<Globe size={18} />}
          title="All agents"
          text="Every agent uses it. You can switch it off for one agent on their page."
        />
        <ScopeCard
          on={value.scope === "agents"}
          onClick={() => onChange({ ...value, scope: "agents" })}
          icon={<Users size={18} />}
          title="Specific agents"
          text="Only the agents you tick below."
        />
      </div>
      {value.scope === "agents" && (
        <div className="flex flex-wrap gap-2">
          {agents.map((a) => {
            const on = value.agentIds.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onChange({ ...value, agentIds: on ? value.agentIds.filter((x) => x !== a.id) : [...value.agentIds, a.id] })}
                className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm"
                style={{ borderColor: on ? "var(--accent)" : "var(--line)", background: on ? "var(--accent-soft)" : "var(--panel)" }}
              >
                <Avatar name={a.name} color={a.appearance.color} sprite={a.appearance.sprite} size={24} />
                {a.name}
                {on && <span style={{ color: "var(--accent)" }}>✓</span>}
              </button>
            );
          })}
          {agents.length === 0 && <span className="muted text-sm">No agents yet.</span>}
        </div>
      )}
    </div>
  );
}

function ScopeCard({ on, onClick, icon, title, text }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-xl border p-3 text-left"
      style={{ borderColor: on ? "var(--accent)" : "var(--line)", background: on ? "var(--accent-soft)" : "var(--panel)" }}
    >
      <span className="mt-0.5" style={{ color: on ? "var(--accent)" : "var(--muted)" }}>
        {icon}
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="muted block text-xs">{text}</span>
      </span>
    </button>
  );
}
