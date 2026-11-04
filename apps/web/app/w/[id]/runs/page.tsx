"use client";
import { useParams } from "next/navigation";
import { RunList } from "@/components/RunList";

export default function WorkspaceRuns() {
  const { id } = useParams<{ id: string }>();
  return <RunList teamId={id} />;
}
