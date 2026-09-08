"use client";

import { useState } from "react";
import { TokenIcon } from "@/components/TokenIcon";
import { normalizeAddress } from "@/lib/format";
import type { PoolPosition } from "@/lib/subscriptions";

/**
 * Turning auto-claim on.
 *
 * The only decision here is where the rewards should land. It defaults to the
 * connected wallet, which is what almost everyone wants, but it is editable
 * because the payout address is written into the receiver permanently — so it
 * is worth getting right once rather than discovering later that it cannot be
 * edited.
 */
export function SubscribeDialog({
  position,
  wallet,
  busy,
  onConfirm,
  onCancel,
}: {
  position: PoolPosition;
  wallet: string;
  busy: boolean;
  onConfirm: (payout: string) => void;
  onCancel: () => void;
}) {
  const [payout, setPayout] = useState(wallet);
  const [custom, setCustom] = useState(false);

  const valid = (() => {
    try {
      const n = BigInt(payout);
      return n > 0n && normalizeAddress(payout).length === 66;
    } catch {
      return false;
    }
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[460px] border border-ink bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <TokenIcon src={position.icon} symbol={position.symbol} />
          <h2 className="text-[18px] font-semibold tracking-[-0.025em]">
            Turn on auto-claim for {position.symbol}
          </h2>
        </div>

        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">
          One transaction. It points your reward address at a receiver contract deployed for you
          alone, which claims each week and forwards to the address below.
          {position.kind === "btc" ? " Rewards accrue in STRK and are swapped to Bitcoin before they reach you." : " Rewards are paid through as STRK."}
        </p>

        <div className="mt-5">
          <div className="text-[12.5px] text-ink-3">Send my rewards to</div>
          {custom ? (
            <input
              autoFocus
              value={payout}
              onChange={(e) => setPayout(e.target.value)}
              spellCheck={false}
              className="mono mt-1.5 w-full border border-line px-2.5 py-2 text-[12.5px] focus:border-ink focus:outline-none"
            />
          ) : (
            <div className="mono mt-1.5 break-all border border-line bg-[#FCFCFC] px-2.5 py-2 text-[12.5px]">
              {payout}
            </div>
          )}

          <div className="mt-2 flex items-center gap-3 text-[12.5px]">
            {custom ? (
              <button
                onClick={() => {
                  setPayout(wallet);
                  setCustom(false);
                }}
                className="text-ink-2 underline hover:text-ink"
              >
                Use my connected wallet
              </button>
            ) : (
              <button onClick={() => setCustom(true)} className="text-ink-2 underline hover:text-ink">
                Send to a different address
              </button>
            )}
            {!valid ? <span className="text-btc">Not a valid address</span> : null}
          </div>

          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
            This is fixed permanently when the receiver is deployed — neither we nor anyone else
            can redirect it afterwards. To pay a different address later you turn auto-claim on
            again with that address, which creates a separate receiver. Your staked principal is
            never involved either way.
          </p>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => onConfirm(payout)}
            disabled={busy || !valid}
            className="rounded-[4px] bg-ink px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-40"
          >
            {busy ? "Confirming…" : "Turn it on"}
          </button>
          <button onClick={onCancel} className="text-[13.5px] text-ink-2 hover:text-ink">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
