/**
 * Compile-time check (not run): the real @opencode/client 2.2.0 client must fit the
 * calls this adapter makes. If OpenCode changes its API, `npm run typecheck` fails
 * here instead of a real run failing later.
 */
import { OpenCode } from "@opencode/client";
import { EVENT_TYPES, type OpenCodeClientLike } from "../src";

declare const real: ReturnType<typeof OpenCode.make>;

// session + model calls: structurally compatible
export const sessionAndModels: Omit<OpenCodeClientLike, "event"> = real;

// event.subscribe: one options object with types + signal, yielding { type, data } events
export function eventsCompile(signal: AbortSignal) {
  const stream = real.event.subscribe({ types: EVENT_TYPES, signal });
  return (async () => {
    for await (const ev of stream) {
      const t: string = ev.type;
      const d: unknown = "data" in ev ? ev.data : undefined;
      void t;
      void d;
    }
  })();
}
