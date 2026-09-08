"use client";

import { fromUnits, num } from "@/lib/format";
import type { Subscription } from "@/lib/subscriptions";

/**
 * Shown when a receiver is holding STRK.
 *
 * This happens when the delegator claims from the pool directly while
 * auto-claim is on: the pool pays the reward address, which is the receiver,
 * with no call attached. Nothing is lost and nobody needs to be asked — the
 * point of the copy is to say so plainly rather than let it look like a fault.
 */
export function StrandedBanner({
  stranded,
  onPush,
  onEscape,
  busy,
}: {
  stranded: Subscription[];
  onPush: (sub: Subscription) => void;
  onEscape: (sub: Subscription) => void;
  busy: string | null;
}) {
  if (stranded.length === 0) return null;

  return (
    <div className="mb-6 space-y-3">
      {stranded.map((s) => (
        <div
          key={s.handler}
          className="flex flex-wrap items-start gap-4 border border-ink p-4"
        >
          <div className="min-w-[260px] flex-1 text-[13.5px] text-ink-2">
            <b className="mb-1 block text-[14px] font-semibold text-ink">
              <span className="mono">{num(fromUnits(s.held, 18), 2)} STRK</span> is sitting in your{" "}
              {s.symbol} receiver
            </b>
            You claimed from the pool directly, so it paid your reward address — the receiver — with
            no call attached. Anyone can push it to your address, including you, and the next
            scheduled run clears it either way.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onPush(s)}
              disabled={busy === s.symbol}
              className="rounded-[4px] bg-ink px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
            >
              {busy === s.symbol ? "Sending…" : "Send to my address"}
            </button>
            {/* Escape gives up the Bitcoin conversion but needs no oracle and no
                router, so it still works when either is unavailable. */}
            <button
              onClick={() => onEscape(s)}
              disabled={busy === s.symbol}
              className="rounded-[4px] border border-line px-4 py-2.5 text-[13px] transition-colors hover:border-ink disabled:opacity-50"
              title="Send it as STRK without swapping. Works even if the price feed or the DEX is unavailable."
            >
              Send as STRK
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
