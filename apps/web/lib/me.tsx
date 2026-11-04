"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, api } from "./api";

export type Role = "owner" | "operator" | "viewer";
export interface Me {
  email: string;
  role: Role;
  /** True on this computer (local port); false through hosted access. */
  local: boolean;
  hosted: boolean;
  dailyBudgetUsd?: number;
  spentTodayUsd?: number;
}

type MeState = { me: Me | null; error: string | null };
const MeContext = createContext<MeState>({ me: null, error: null });

/** Who is using Agent Town. The server decides; this only shapes the UI. */
export function MeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MeState>({ me: null, error: null });
  useEffect(() => {
    api<Me>("/api/me")
      .then((me) => setState({ me, error: null }))
      .catch((e) => setState({ me: null, error: e instanceof ApiError && (e.status === 401 || e.status === 403) ? e.message : null }));
  }, []);
  return <MeContext.Provider value={state}>{children}</MeContext.Provider>;
}

export const useMe = () => useContext(MeContext);
