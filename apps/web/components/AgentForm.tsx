"use client";
import Link from "next/link";
import { ChevronDown, Globe, Sparkles } from "lucide-react";
import { useState } from "react";
import type { AgentTemplate, Skill } from "@agent-town/core";
import type { RuntimeInfo, ToolInfo } from "@/lib/api";
import { PixelCharacter, characterIndex } from "./ui";

/**
 * Agent configuration form (layout follows Multica's "Create an agent" pattern —
 * design only, no Multica code): Identity → Behavior & capabilities → Advanced.
 * Used by the New agent flow and by the agent's Settings tab.
 */

export const AGENT_COLORS = ["#2a9d8f", "#e76f51", "#4f86f7", "#9b5de5", "#e9c46a", "#43aa8b", "#f15bb5", "#577590", "#ef476f", "#118ab2"];
export const CHARACTER_COUNT = 6;

export function blankAgent(runtime = "mock"): AgentTemplate {
  return {
    id: "",
    name: "",
    role: "",
    department: "General",
    description: "",
    systemPrompt: "",
    runtime,
    tools: [],
    skills: [],
    permissions: { autoApproveWrite: false, shell: false },
    appearance: { color: AGENT_COLORS[Math.floor(Math.random() * AGENT_COLORS.length)]!, sprite: `char-${Math.floor(Math.random() * CHARACTER_COUNT)}` },
  };
}

const INSTRUCTIONS_EXAMPLE = `You review marketing copy before it goes out.

Check first:
- Every number and claim matches the research notes
- Tone matches the brand voice

Don't rewrite the copy yourself. Start your answer with
VERDICT: APPROVE or VERDICT: REJECT, then list issues by severity.`;

export function AgentForm({
  agent,
  onChange,
  runtimes,
  tools,
  skills,
}: {
  agent: AgentTemplate;
  onChange: (a: AgentTemplate) => void;
  runtimes: RuntimeInfo[];
  tools: ToolInfo[];
  skills: Skill[];
}) {
  const [advanced, setAdvanced] = useState(false);
  const set = (patch: Partial<AgentTemplate>) => onChange({ ...agent, ...patch });
  const runtime = runtimes.find((r) => r.id === (agent.runtime || "mock"));
  const models = runtime?.models ?? [];
  const look = characterIndex(agent.appearance.sprite);
  const refs = new Map(agent.skills.map((r) => [r.skillId, r.enabled]));
  const setSkill = (skill: Skill, on: boolean) => {
    const others = agent.skills.filter((r) => r.skillId !== skill.id);
    // Global skills are on by default: store only an explicit "off". Agent skills: store "on".
    if (skill.scope === "global") set({ skills: on ? others : [...others, { skillId: skill.id, enabled: false }] });
    else set({ skills: on ? [...others, { skillId: skill.id, enabled: true }] : others });
  };
  const isOn = (s: Skill) => (s.scope === "global" ? refs.get(s.id) !== false : refs.get(s.id) === true);
  const globalSkills = skills.filter((s) => s.scope === "global");
  const agentSkills = skills.filter((s) => s.scope !== "global");

  return (
    <div className="space-y-6">
      <Section title="Identity" hint="A recognizable name, a look, and a short purpose.">
        <Row label="Look">
          <div className="flex flex-wrap items-end gap-2">
            {Array.from({ length: CHARACTER_COUNT }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => set({ appearance: { ...agent.appearance, sprite: `char-${i}` } })}
                className="flex h-[76px] w-12 items-end justify-center overflow-hidden rounded-xl border-2 pb-1"
                style={{ borderColor: look === i ? "var(--accent)" : "var(--line)", background: look === i ? "var(--accent-soft)" : "var(--panel-2)" }}
                aria-label={`Character ${i + 1}`}
              >
                <PixelCharacter index={i} scale={2} />
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {AGENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set({ appearance: { ...agent.appearance, color: c } })}
                className="h-6 w-6 rounded-full"
                style={{ background: c, boxShadow: agent.appearance.color === c ? "0 0 0 2px var(--panel), 0 0 0 4px var(--ink)" : undefined }}
                aria-label={`Colour ${c}`}
              />
            ))}
            <span className="hint ml-2 self-center">Colour = name tag &amp; badges</span>
          </div>
        </Row>
        <Row label="Name">
          <input className="input" value={agent.name} placeholder="e.g. Rae" onChange={(e) => set({ name: e.target.value })} />
        </Row>
        <Row label="Role">
          <input className="input" value={agent.role} placeholder="e.g. Fact checker" onChange={(e) => set({ role: e.target.value })} />
        </Row>
        <Row label="Description" hint="For people only — never sent to the model.">
          <textarea className="input" rows={2} maxLength={255} value={agent.description} placeholder="What does this agent do?" onChange={(e) => set({ description: e.target.value })} />
          <div className="hint mt-1 text-right">{agent.description.length} / 255</div>
        </Row>
      </Section>

      <Section title="Behavior & capabilities" hint="How it should work, the skills it can rely on, and the model it uses.">
        <Row label="Instructions" hint="Sent on every step: responsibilities, what to check first, what it may change, how to deliver.">
          <textarea className="input font-mono text-[13px]" rows={8} value={agent.systemPrompt} placeholder={INSTRUCTIONS_EXAMPLE} onChange={(e) => set({ systemPrompt: e.target.value })} />
        </Row>
        <Row label="Skills" hint="Reusable know-how from your Skills library.">
          {skills.length === 0 ? (
            <p className="muted text-sm">
              No skills yet. <Link href="/skills" className="underline">Add one in the Skills library</Link>.
            </p>
          ) : (
            <div className="space-y-3">
              {globalSkills.length > 0 && (
                <div>
                  <div className="hint mb-1 flex items-center gap-1">
                    <Globe size={12} /> For all agents — switch off for this one if it doesn&apos;t apply
                  </div>
                  <SkillChecks skills={globalSkills} isOn={isOn} onToggle={setSkill} />
                </div>
              )}
              {agentSkills.length > 0 && (
                <div>
                  <div className="hint mb-1 flex items-center gap-1">
                    <Sparkles size={12} /> Pick for this agent
                  </div>
                  <SkillChecks skills={agentSkills} isOn={isOn} onToggle={setSkill} />
                </div>
              )}
            </div>
          )}
        </Row>
        <Row label="Model" hint={runtime ? `Models available in ${runtime.name}. Leave empty for the team default.` : undefined}>
          <input className="input font-mono" list="agent-models" value={agent.model?.id ?? ""} placeholder="Team default" onChange={(e) => set({ model: e.target.value ? { ...agent.model, id: e.target.value } : undefined })} />
          <datalist id="agent-models">
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </datalist>
          <input
            className="input mt-2 font-mono text-xs"
            list="agent-models"
            value={agent.model?.fallbackId ?? ""}
            placeholder="Fallback model if the first fails (optional)"
            disabled={!agent.model?.id}
            onChange={(e) => agent.model && set({ model: { ...agent.model, fallbackId: e.target.value || undefined } })}
          />
        </Row>
      </Section>

      <div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdvanced(!advanced)}>
          <ChevronDown size={14} style={{ transform: advanced ? "rotate(180deg)" : undefined }} /> Advanced: tools, approvals, cost cap
        </button>
        {advanced && (
          <div className="mt-3">
            <Section title="Tools & permissions" hint="Send and spend tools always ask you first, whatever is set here.">
              <Row label="Allowed tools">
                <div className="grid gap-1 sm:grid-cols-2">
                  {tools.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={agent.tools.includes(t.id)}
                        onChange={(e) => set({ tools: e.target.checked ? [...agent.tools, t.id] : agent.tools.filter((x) => x !== t.id) })}
                      />
                      <span className="font-mono text-xs">{t.id}</span>
                      <span className="chip !h-5 !px-1.5 text-[10px]" style={{ background: "var(--bg-soft)", color: t.category === "send" || t.category === "spend" ? "var(--bad)" : t.category === "write" ? "var(--warn)" : "var(--ok)" }}>
                        {t.category}
                      </span>
                    </label>
                  ))}
                </div>
              </Row>
              <Row label="Write tools">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={agent.permissions.autoApproveWrite} onChange={(e) => set({ permissions: { ...agent.permissions, autoApproveWrite: e.target.checked } })} />
                  Don&apos;t ask me before write tools
                </label>
              </Row>
              <Row label="Cost cap per run (USD)">
                <input className="input max-w-40" type="number" min="0" step="0.01" value={agent.costCapUsd ?? ""} placeholder="none" onChange={(e) => set({ costCapUsd: e.target.value === "" ? undefined : Number(e.target.value) })} />
              </Row>
              <Row label="Department">
                <input className="input max-w-64" value={agent.department} onChange={(e) => set({ department: e.target.value })} />
              </Row>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function SkillChecks({ skills, isOn, onToggle }: { skills: Skill[]; isOn: (s: Skill) => boolean; onToggle: (s: Skill, on: boolean) => void }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {skills.map((s) => (
        <label key={s.id} className="flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm" style={{ borderColor: isOn(s) ? "var(--accent)" : "var(--line)", background: isOn(s) ? "var(--accent-soft)" : undefined }}>
          <input type="checkbox" className="mt-0.5" checked={isOn(s)} onChange={(e) => onToggle(s, e.target.checked)} />
          <span className="min-w-0">
            <span className="block font-medium">{s.name}</span>
            <span className="muted line-clamp-2 block text-xs">{s.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-semibold">{title}</h3>
      {hint && <p className="muted mb-3 text-sm">{hint}</p>}
      <div className="panel divide-y" style={{ borderColor: "var(--line)" }}>
        {children}
      </div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 p-4 md:grid-cols-[200px_1fr]" style={{ borderColor: "var(--line)" }}>
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="hint mt-0.5">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}
