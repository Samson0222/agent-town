export interface Handoff {
  fromNodeId: string;
  fromLabel: string;
  fromAgent?: string;
  output: string;
}

export interface TemplateContext {
  inputs: Record<string, string>;
  outputs: Map<string, string>;
  upstream: Handoff[];
  feedback?: string;
  maxChars: number;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n…[truncated ${text.length - max} chars]`;
}

export function formatUpstream(upstream: Handoff[], maxChars: number): string {
  return upstream
    .map((h) => `### From ${h.fromLabel}${h.fromAgent ? ` (${h.fromAgent})` : ""}\n${truncate(h.output, maxChars)}`)
    .join("\n\n");
}

/** Render {{input.x}}, {{nodes.id.output}}, {{upstream}}, {{feedback}}. Unknown keys render empty. */
export function renderTemplate(tpl: string, ctx: TemplateContext): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_.\-]+)\s*\}\}/g, (_m, key: string) => {
    if (key === "upstream") return formatUpstream(ctx.upstream, ctx.maxChars);
    if (key === "feedback") return ctx.feedback ?? "";
    const [scope, id, field] = key.split(".");
    if (scope === "input" && id) return ctx.inputs[id] ?? "";
    if (scope === "nodes" && id && (field === "output" || field === undefined)) {
      return truncate(ctx.outputs.get(id) ?? "", ctx.maxChars);
    }
    return "";
  });
}

export function usesKey(tpl: string, key: string): boolean {
  return new RegExp(`\\{\\{\\s*${key.replace(".", "\\.")}\\s*\\}\\}`).test(tpl);
}
