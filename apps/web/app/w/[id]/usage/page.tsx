"use client";
import { useParams } from "next/navigation";
import { UsageView } from "@/components/UsageView";

export default function WorkspaceUsage() {
  const { id } = useParams<{ id: string }>();
  return <UsageView teamId={id} />;
}
