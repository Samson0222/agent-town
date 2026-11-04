"use client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { TeamSettings } from "@/components/TeamSettings";
import { useDialogs } from "@/components/Dialogs";
import { api, errorText } from "@/lib/api";
import { useWorkspaces } from "@/lib/workspace";

export default function WorkspaceSettings() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm } = useDialogs();
  const { current, reload } = useWorkspaces();
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    if (!(await confirm({ title: `Delete ${current?.name ?? "this workspace"}?`, message: "Its workflows go too. Past runs stay in Runs.", confirmLabel: "Delete", danger: true }))) return;
    try {
      await api(`/api/teams/${encodeURIComponent(id)}?force=1`, { method: "DELETE" });
      await reload();
      router.push("/");
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <div className="space-y-5">
      <TeamSettings id={id} onSaved={() => void reload()} />
      <section className="panel flex flex-wrap items-center gap-3 p-5" data-needs="owner">
        <span className="font-semibold">Delete workspace</span>
        <button className="btn btn-danger ml-auto" onClick={remove}>
          <Trash2 size={16} /> Delete
        </button>
        {error && <p className="w-full text-sm" style={{ color: "var(--bad)" }}>{error}</p>}
      </section>
    </div>
  );
}
