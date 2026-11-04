"use client";
import { useParams } from "next/navigation";
import { Office } from "@/components/Office";
import { useWorkspaces } from "@/lib/workspace";

export default function AiAgentPage() {
  const { id } = useParams<{ id: string }>();
  const { current: ws } = useWorkspaces();
  if (!ws || ws.id !== id) return <p className="muted">Loading…</p>;
  const people = ws.agents.map((a) => ({ id: a.id, name: a.name, color: a.appearance.color, status: "idle" as const, sprite: a.appearance.sprite }));
  return (
    <div className="panel overflow-hidden">
      <Office people={people} height={620} defaultMode={ws.officeStyle} viewScope={ws.id} />
    </div>
  );
}
