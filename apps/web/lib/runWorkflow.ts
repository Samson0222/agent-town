"use client";
import { useRouter } from "next/navigation";
import type { Workflow } from "@agent-town/core";
import { useDialogs } from "@/components/Dialogs";
import { api, errorText } from "./api";

/** Start a workflow directly: ask for its main input, then open the run. */
export function useRunWorkflow(onError: (msg: string) => void) {
  const router = useRouter();
  const { prompt } = useDialogs();
  return async (wf: Workflow) => {
    const main = wf.inputs.find((i) => i.type === "longtext") ?? wf.inputs[0];
    const inputs: Record<string, string> = Object.fromEntries(wf.inputs.map((i) => [i.key, i.default ?? ""]));
    if (main) {
      const v = await prompt({ title: `Run ${wf.name}`, label: main.label || main.key, defaultValue: inputs[main.key] ?? "", confirmLabel: "Run" });
      if (v === null) return;
      inputs[main.key] = v;
    }
    try {
      const r = await api<{ runId: string }>("/api/runs", { json: { workflowId: wf.id, inputs } });
      router.push(`/runs/${r.runId}`);
    } catch (e) {
      onError(errorText(e));
    }
  };
}
