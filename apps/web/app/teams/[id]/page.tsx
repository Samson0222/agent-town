"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Teams became workspaces: a team's page is now its workspace's Settings. */
export default function TeamRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => router.replace(`/w/${encodeURIComponent(id)}/settings`), [id, router]);
  return null;
}
