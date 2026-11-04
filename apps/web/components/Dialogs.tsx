"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/** In-app replacements for window.confirm / window.prompt, so nothing ever uses the browser's native dialogs. */

type ConfirmOpts = { title?: string; message?: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type PromptOpts = { title: string; message?: ReactNode; label?: string; defaultValue?: string; placeholder?: string; confirmLabel?: string };

type Open =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOpts; resolve: (v: string | null) => void };

type Ctx = {
  confirm: (opts: ConfirmOpts | string) => Promise<boolean>;
  prompt: (opts: PromptOpts) => Promise<string | null>;
};

const DialogCtx = createContext<Ctx | null>(null);

export function useDialogs(): Ctx {
  const c = useContext(DialogCtx);
  if (!c) throw new Error("useDialogs must be used inside <DialogProvider>");
  return c;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback(
    (opts: ConfirmOpts | string) =>
      new Promise<boolean>((resolve) => setOpen({ kind: "confirm", opts: typeof opts === "string" ? { message: opts } : opts, resolve })),
    [],
  );
  const prompt = useCallback(
    (opts: PromptOpts) =>
      new Promise<string | null>((resolve) => {
        setValue(opts.defaultValue ?? "");
        setOpen({ kind: "prompt", opts, resolve });
      }),
    [],
  );

  const close = (result: boolean | string | null) => {
    if (!open) return;
    if (open.kind === "confirm") open.resolve(result === true);
    else open.resolve(typeof result === "string" ? result : null);
    setOpen(null);
  };
  const cancel = () => close(open?.kind === "confirm" ? false : null);
  const submit = () => {
    if (!open) return;
    if (open.kind === "confirm") close(true);
    else if (value.trim()) close(value.trim());
  };

  useEffect(() => {
    if (!open) return;
    (open.kind === "prompt" ? inputRef.current : okRef.current)?.focus();
    inputRef.current?.select();
  }, [open]);

  const danger = open?.kind === "confirm" && open.opts.danger;
  const title = open ? (open.kind === "prompt" ? open.opts.title : open.opts.title ?? "Are you sure?") : "";

  return (
    <DialogCtx.Provider value={{ confirm, prompt }}>
      {children}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: "rgba(10, 12, 28, 0.55)", backdropFilter: "blur(3px)" }}
          onMouseDown={(e) => e.target === e.currentTarget && cancel()}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
            if (e.key === "Enter" && open.kind === "prompt") submit();
          }}
        >
          <div role="dialog" aria-modal="true" aria-label={title} className="panel w-full max-w-md p-6" style={{ boxShadow: "0 20px 60px rgba(0,0,0,.35)" }}>
            <h2 className="text-lg font-bold">{title}</h2>
            {open.opts.message && <div className="muted mt-2 whitespace-pre-line text-sm leading-relaxed">{open.opts.message}</div>}
            {open.kind === "prompt" && (
              <label className="mt-4 block">
                {open.opts.label && <span className="mb-1 block text-xs font-semibold">{open.opts.label}</span>}
                <input ref={inputRef} className="input w-full" value={value} placeholder={open.opts.placeholder} onChange={(e) => setValue(e.target.value)} />
              </label>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn" onClick={cancel}>
                {open.kind === "confirm" ? open.opts.cancelLabel ?? "Cancel" : "Cancel"}
              </button>
              <button
                ref={okRef}
                className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
                disabled={open.kind === "prompt" && !value.trim()}
                onClick={submit}
              >
                {open.opts.confirmLabel ?? (open.kind === "prompt" ? "Create" : "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogCtx.Provider>
  );
}
