"use client";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Team } from "@agent-town/core";
import { api } from "./api";

/** A workspace is a team with a goal, an office and a main agent (the server stores it as a team). */
export type Workspace = Team;

const KEY = "agent-town:workspace";

type State = {
  workspaces: Workspace[] | null;
  /** The open workspace: the one in the URL, else the last one opened. */
  current?: Workspace;
  reload: () => Promise<void>;
};
const Ctx = createContext<State>({ workspaces: null, reload: async () => undefined });

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "/";
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [remembered, setRemembered] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setWorkspaces(await api<Workspace[]>("/api/teams").catch(() => []));
  }, []);
  useEffect(() => {
    void reload();
    try {
      setRemembered(localStorage.getItem(KEY));
    } catch {}
  }, [reload]);
  const inUrl = /^\/w\/([^/]+)/.exec(path)?.[1];
  const id = inUrl ? decodeURIComponent(inUrl) : remembered;
  useEffect(() => {
    if (!inUrl) return;
    const v = decodeURIComponent(inUrl);
    setRemembered(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {}
  }, [inUrl]);
  // Pick up renames and new workspaces when moving between pages.
  useEffect(() => {
    void reload();
  }, [inUrl, reload]);
  const current = workspaces?.find((w) => w.id === id);
  return <Ctx.Provider value={{ workspaces, current, reload }}>{children}</Ctx.Provider>;
}

export const useWorkspaces = () => useContext(Ctx);

export const wsPath = (id: string, page = "") => `/w/${encodeURIComponent(id)}${page ? `/${page}` : ""}`;
