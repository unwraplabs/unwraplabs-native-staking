"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "@starknet-react/core";
import { TokenIcon } from "@/components/TokenIcon";
import { compact, fromUnits, num } from "@/lib/format";
import { readPoolMember, type PoolMember, type PoolPosition } from "@/lib/subscriptions";
import { poolsForAsset, type ValidatorPool } from "@/lib/validators";

/**
 * Move a delegation here from another validator.
 *
 * The point of the flow is that it is one transaction and the stake never
 * leaves the network's staking system — so the copy leads with that, because
 * "switch" otherwise sounds like "unstake, wait, restake".
 */
export function SwitchDialog({
  position,
  busy,
  onConfirm,
  onCancel,
}: {
  position: PoolPosition;
  busy: boolean;
  onConfirm: (source: ValidatorPool, amount: bigint) => void;
  onCancel: () => void;
}) {
  const { address } = useAccount();
  const [validators, setValidators] = useState<ValidatorPool[] | null>(null);
  const [selected, setSelected] = useState<ValidatorPool | null>(null);
  const [there, setThere] = useState<PoolMember | null | "loading">(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    poolsForAsset({ kind: position.kind, token: position.token, decimals: position.decimals })
      .then(setValidators)
      .catch(() => setError("Could not load the validator list."));
  }, [position]);

  // Their position at the chosen validator is the whole basis for the amount
  // field, so it is read as soon as one is picked rather than on submit.
  useEffect(() => {
    if (!selected || !address) return;
    setThere("loading");
    setValue("");
    readPoolMember(selected.pool, address)
      .then(setThere)
      .catch(() => setThere(null));
  }, [selected, address]);

  const available = useMemo(() => {
    if (!there || there === "loading") return 0;
    // Anything already signalled for exit can still move, so it counts.
    return fromUnits(there.amount + there.unpoolAmount, position.decimals);
  }, [there, position.decimals]);

  const dp = position.symbol === "STRK" ? 2 : 6;
  const entered = Number(value);
  const overAvailable = Number.isFinite(entered) && entered > available;
  const canSubmit =
    selected && there && there !== "loading" && entered > 0 && !overAvailable && !busy;

  const submit = () => {
    if (!canSubmit || !selected) return;
    onConfirm(selected, BigInt(entered.toFixed(position.decimals).replace(".", "")));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto border border-ink bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <TokenIcon src={position.icon} symbol={position.symbol} />
          <h2 className="text-[18px] font-semibold tracking-[-0.025em]">
            Switch {position.symbol} delegation here
          </h2>
        </div>

        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">
          Move a delegation from another validator to us in a single transaction — no unstaking,
          no exit window, and no gap where your stake is idle. Your {position.symbol} never leaves
          Starknet&apos;s staking contract; only the validator earning on it changes.
        </p>

        <div className="mt-5">
          <div className="text-[12.5px] text-ink-3">Currently delegated to</div>
          {error ? <p className="mt-2 text-[13px] text-btc">{error}</p> : null}
          {!validators && !error ? (
            <p className="mt-2 text-[13px] text-ink-3">Loading validators…</p>
          ) : null}
          {validators ? (
            <select
              value={selected?.pool ?? ""}
              onChange={(e) =>
                setSelected(validators.find((v) => v.pool === e.target.value) ?? null)
              }
              className="mt-1.5 w-full border border-line bg-white px-2.5 py-2 text-[13.5px] focus:border-ink focus:outline-none"
            >
              <option value="">Choose a validator…</option>
              {validators.map((v) => (
                <option key={v.pool} value={v.pool}>
                  {v.name} — {compact(v.totalStaked, 1)} {position.symbol} delegated
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {selected ? (
          <div className="mt-4 border border-line bg-[#FCFCFC] p-3">
            {there === "loading" ? (
              <p className="text-[13px] text-ink-3">Reading your position at {selected.name}…</p>
            ) : !there ? (
              <p className="text-[13px] text-ink-2">
                This wallet has no {position.symbol} delegated to {selected.name}.
              </p>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[12.5px] text-ink-3">
                    Your stake at {selected.name}
                  </span>
                  <span className="mono text-[15px] font-medium">
                    {num(fromUnits(there.amount, position.decimals), dp)} {position.symbol}
                  </span>
                </div>
                {there.unpoolAmount > 0n ? (
                  <div className="mt-1 flex items-baseline justify-between gap-4">
                    <span className="text-[12.5px] text-ink-3">Already exiting there</span>
                    <span className="mono text-[13px]">
                      {num(fromUnits(there.unpoolAmount, position.decimals), dp)}{" "}
                      {position.symbol}
                    </span>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {there && there !== "loading" && available > 0 ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[13px] text-ink-2">Amount to switch</label>
              <input
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="0.00"
                aria-invalid={overAvailable}
                className={`mono w-36 border px-2 py-1.5 text-[13.5px] focus:outline-none ${
                  overAvailable ? "border-btc" : "border-line focus:border-ink"
                }`}
              />
              <span className="mono text-[12px] text-ink-3">{position.symbol}</span>
              <button
                onClick={() => setValue(String(available))}
                className="mono text-[12px] text-ink-2 underline transition-colors hover:text-ink"
              >
                Max
              </button>
            </div>
            <p className="mt-2 text-[12.5px] text-ink-3">
              Available to switch{" "}
              <span className="mono text-ink-2">
                {num(available, dp)} {position.symbol}
              </span>
              {overAvailable ? (
                <span className="ml-2 text-btc">More than you have there</span>
              ) : null}
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-[4px] bg-ink px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-40"
          >
            {busy ? "Switching…" : "Switch to Unwrap Labs"}
          </button>
          <button onClick={onCancel} className="text-[13.5px] text-ink-2 hover:text-ink">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
