"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Teams became workspaces. */
export default function TeamsRedirect() {
  const router = useRouter();
  useEffect(() => router.replace("/"), [router]);
  return null;
}
