"use client";
import { useParams } from "next/navigation";
import { WorkflowList } from "@/components/WorkflowList";

export default function WorkspaceWorkflows() {
  const { id } = useParams<{ id: string }>();
  return <WorkflowList teamId={id} />;
}
