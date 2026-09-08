"use client";

import { useState } from "react";
import { ClaimIcon, StakeIcon, SwitchIcon, UnstakeIcon } from "@/components/Icons";
import { TokenIcon } from "@/components/TokenIcon";
import { Tooltip } from "@/components/Tooltip";
import { explorerContract, explorerTx } from "@/lib/config";
import { fromUnits, num, shortHex, usd } from "@/lib/format";
import { serviceTier, stakedAmount, stakedUsd } from "@/lib/positions";
import { summarise, type HistoryEntry } from "@/lib/history";
import { ActivitySkeleton } from "./Skeleton";
import type { Prices } from "@/lib/prices";
import type { PoolPosition, Subscription } from "@/lib/subscriptions";

function Figure({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[12.5px] text-ink-3">{label}</div>
      <div className="mono mt-0.5 text-[26px] font-medium tracking-[-0.05em]">
        {value}
        {unit ? <span className="ml-1.5 text-[13px] tracking-normal text-ink-2">{unit}</span> : null}
      </div>
      {sub ? <div className="mt-0.5 text-[12.5px] text-ink-3">{sub}</div> : null}
    </div>
  );
}

/** Amount entry that converts to base units on submit. */
function AmountForm({
  action,
  symbol,
  decimals,
  available,
  availableLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  action: "Stake" | "Unstake";
  symbol: string;
  decimals: number;
  /** How much can go into this action: wallet balance, or the staked amount. */
  available: number;
  availableLabel: string;
  busy: boolean;
  onSubmit: (amount: bigint) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const entered = Number(value);
  const overAvailable = Number.isFinite(entered) && entered > available;

  const submit = () => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > available) return;
    // Round through a fixed-decimal string so floating point never introduces a
    // trailing fraction of a base unit.
    onSubmit(BigInt(parsed.toFixed(decimals).replace(".", "")));
  };

  const dp = symbol === "STRK" ? 2 : 6;

  return (
    <div className="mt-4 border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[13px] text-ink-2">
          {action} amount
          <span className="sr-only"> in {symbol}</span>
        </label>
        <input
          autoFocus
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="0.00"
          aria-invalid={overAvailable}
          className={`mono w-32 border px-2 py-1.5 text-[13.5px] focus:outline-none ${
            overAvailable ? "border-btc" : "border-line focus:border-ink"
          }`}
        />
        <span className="mono text-[12px] text-ink-3">{symbol}</span>
        <button
          onClick={submit}
          disabled={busy || overAvailable}
          className="rounded-[4px] bg-ink px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-40"
        >
          {busy ? "Working…" : action}
        </button>
        <button onClick={onCancel} className="px-2 text-[13px] text-ink-2 hover:text-ink">
          Cancel
        </button>
      </div>

      {/* What you can actually put in. Without this the field is a guess, and
          the transaction fails at the wallet rather than here. */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="text-ink-3">
          {availableLabel} <span className="mono text-ink-2">{num(available, dp)} {symbol}</span>
        </span>
        {available > 0 ? (
          <button
            onClick={() => setValue(String(available))}
            className="mono text-[12px] text-ink-2 underline transition-colors hover:text-ink"
          >
            Max
          </button>
        ) : null}
        {overAvailable ? (
          <span className="text-btc">More than you have available</span>
        ) : null}
      </div>
    </div>
  );
}

/** Address row with an explanation, used for the two addresses that matter. */
function AddressRow({
  label,
  address,
  explain,
}: {
  label: string;
  address: string;
  explain: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-[12.5px]">
      <Tooltip label={<span className="text-ink-2">{label}</span>}>{explain}</Tooltip>
      <a
        href={explorerContract(address)}
        target="_blank"
        rel="noopener noreferrer"
        className="mono text-ink transition-colors hover:underline"
      >
        {shortHex(address)}
      </a>
    </div>
  );
}

export function PositionCard({
  position,
  subscription,
  history,
  historyLoading,
  prices,
  apr,
  busy,
  onClaim,
  onSubscribe,
  onUnsubscribe,
  onStake,
  onUnstake,
  onSwitch,
}: {
  position: PoolPosition;
  subscription?: Subscription;
  /** The receiver's own event log, when there is a receiver. */
  history?: HistoryEntry[];
  /** True while that log is still being read. */
  historyLoading?: boolean;
  prices: Prices;
  apr?: number;
  busy: boolean;
  onClaim: () => void;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
  onStake: (amount: bigint) => void;
  onUnstake: (amount: bigint) => void;
  onSwitch: () => void;
}) {
  const [form, setForm] = useState<"stake" | "unstake" | null>(null);

  const staked = stakedAmount(position);
  const walletBalance = fromUnits(position.walletBalance, position.decimals);
  const value = stakedUsd(position, prices);
  const unclaimed = position.unclaimed ? fromUnits(position.unclaimed, 18) : 0;
  const isBtc = position.kind === "btc";
  const auto = subscription?.active ?? false;
  const swapsToBtc =
    auto && Boolean(subscription?.outToken) && BigInt(subscription!.outToken) !== 0n;
  const tier = serviceTier(position, prices);

  // What the receiver has actually done, read from its own events. Only the
  // payout token is shown alongside the claim total — for a BTC receiver those
  // are different denominations and adding them would be nonsense.
  const summary = summarise(history ?? []);
  const payoutToken = subscription?.outToken;
  const paidOut =
    payoutToken && BigInt(payoutToken) !== 0n
      ? (summary.paidOut.get(payoutToken) ?? 0n)
      : [...summary.paidOut.values()].reduce((a, b) => a + b, 0n);
  const paidOutSymbol = swapsToBtc ? position.symbol : "STRK";
  const paidOutDecimals = swapsToBtc ? position.decimals : 18;

  return (
    <div className="min-w-0 border-t border-line py-6">
      <div className="mb-4 flex items-center gap-3">
        <TokenIcon src={position.icon} symbol={position.symbol} />
        <h3 className="text-[17px] font-semibold tracking-[-0.02em]">{position.symbol}</h3>
        {auto ? (
          <span className="flex items-center gap-1.5 rounded-[3px] border border-line px-2 py-0.5 font-mono text-[11px] text-ink-2">
            <span className="h-1.5 w-1.5 rounded-full bg-live" />
            auto-claim On
          </span>
        ) : null}
        <span className="ml-auto font-mono text-[12px] text-ink-2">
          {apr !== undefined ? `APR ${num(apr, 2)}%` : null}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-5 2xl:gap-x-12">
        <Figure
          label="Staked"
          value={num(staked, isBtc ? 6 : 2)}
          unit={position.symbol}
          sub={value !== null ? `≈ ${usd(value)}` : undefined}
        />
        <Figure
          label="Unclaimed rewards"
          value={num(unclaimed, 2)}
          unit="STRK"
          sub={
            swapsToBtc
              ? `Swapped to ${position.symbol} on claim`
              : "Paid as STRK"
          }
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setForm(form === "stake" ? null : "stake")}
          disabled={walletBalance === 0}
          title={walletBalance === 0 ? `No ${position.symbol} in this wallet` : undefined}
          className="flex items-center gap-2 rounded-[4px] bg-ink px-4 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-40"
        >
          <StakeIcon />
          Stake
        </button>
        <button
          onClick={() => setForm(form === "unstake" ? null : "unstake")}
          disabled={staked === 0}
          title={staked === 0 ? `Nothing staked to unstake` : undefined}
          className="flex items-center gap-2 rounded-[4px] border border-line px-4 py-2 text-[13.5px] transition-colors hover:border-ink disabled:opacity-40"
        >
          <UnstakeIcon />
          Unstake
        </button>
        <button
          onClick={onClaim}
          disabled={busy || unclaimed === 0}
          title={
            busy
              ? "Waiting on the transaction you just sent"
              : unclaimed === 0
                ? "No rewards have accrued yet"
                : undefined
          }
          className="flex items-center gap-2 rounded-[4px] border border-line px-4 py-2 text-[13.5px] transition-colors hover:border-ink disabled:opacity-40"
        >
          <ClaimIcon />
          {auto ? "Claim now" : "Claim rewards"}
        </button>

        <button
          onClick={onSwitch}
          disabled={busy}
          title={
            busy
              ? "Waiting on the transaction you just sent"
              : `Move ${position.symbol} here from another validator, in one transaction`
          }
          className="flex items-center gap-2 rounded-[4px] border border-line px-4 py-2 text-[13.5px] transition-colors hover:border-ink disabled:opacity-40"
        >
          <SwitchIcon />
          Switch here
        </button>

        {auto ? (
          <button
            onClick={onUnsubscribe}
            disabled={busy}
            title={busy ? "Waiting on the transaction you just sent" : undefined}
            className="rounded-[4px] border border-line px-4 py-2 text-[13.5px] transition-colors hover:border-ink disabled:opacity-40"
          >
            Turn off auto-claim
          </button>
        ) : (
          <button
            onClick={onSubscribe}
            disabled={busy}
            title={
              busy
                ? "Waiting on the transaction you just sent"
                : "Auto-claim works at any size — there is no minimum"
            }
            className="rounded-[4px] border border-ink px-4 py-2 text-[13.5px] font-medium transition-colors hover:bg-ink hover:text-white disabled:opacity-40"
          >
            Turn on auto-claim
          </button>
        )}

        <a
          href={explorerContract(position.pool)}
          target="_blank"
          rel="noopener noreferrer"
          className="verify ml-auto"
        >
          Pool contract
        </a>
      </div>

      {form === "stake" ? (
        <AmountForm
          action="Stake"
          symbol={position.symbol}
          decimals={position.decimals}
          available={walletBalance}
          availableLabel="In your wallet:"
          busy={busy}
          onSubmit={(a) => {
            onStake(a);
            setForm(null);
          }}
          onCancel={() => setForm(null)}
        />
      ) : null}
      {form === "unstake" ? (
        <AmountForm
          action="Unstake"
          symbol={position.symbol}
          decimals={position.decimals}
          available={staked}
          availableLabel="Currently staked:"
          busy={busy}
          onSubmit={(a) => {
            onUnstake(a);
            setForm(null);
          }}
          onCancel={() => setForm(null)}
        />
      ) : null}

      {/* What the receiver has actually paid, not what it promises to pay.
          Both figures come from its own events, so they are checkable. */}
      {auto && subscription && historyLoading && !history ? <ActivitySkeleton /> : null}

      {auto && subscription && !(historyLoading && !history) ? (
        <div className="mt-5 border border-line p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] text-ink-3">Since you turned it on</span>
            {summary.runs > 0 ? (
              <span className="mono text-[11.5px] text-ink-3">
                {summary.runs} {summary.runs === 1 ? "payout" : "payouts"}
              </span>
            ) : null}
          </div>

          {summary.runs === 0 && summary.claimed === 0n ? (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
              Nothing claimed yet. The next scheduled run will pick up your rewards, or you can
              claim now and have them sent straight through.
            </p>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap gap-x-10 gap-y-3">
                <div>
                  <div className="text-[12px] text-ink-3">Claimed from the pool</div>
                  <div className="mono mt-0.5 text-[17px] font-medium tracking-[-0.03em]">
                    {num(fromUnits(summary.claimed, 18), 2)}
                    <span className="ml-1 text-[11.5px] tracking-normal text-ink-2">STRK</span>
                  </div>
                </div>
                <div>
                  <div className="text-[12px] text-ink-3">Sent to you</div>
                  <div className="mono mt-0.5 text-[17px] font-medium tracking-[-0.03em]">
                    {num(fromUnits(paidOut, paidOutDecimals), paidOutSymbol === "STRK" ? 2 : 6)}
                    <span className="ml-1 text-[11.5px] tracking-normal text-ink-2">
                      {paidOutSymbol}
                    </span>
                  </div>
                </div>
              </div>
              {summary.lastTxHash ? (
                <a
                  href={explorerTx(summary.lastTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="verify mt-2.5 inline-block"
                >
                  Last run{summary.lastBlock ? ` · block ${summary.lastBlock}` : ""}
                </a>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {/* The two addresses a subscribed delegator should be able to see and
          check, with the distinction between them spelled out — they are easy
          to confuse and only one of them holds anything. */}
      {auto && subscription ? (
        <div className="mt-4 border-t border-line-2 pt-2">
          <AddressRow
            label="Reward address (set on the pool)"
            address={subscription.rewardAddress}
            explain={
              <>
                The address the staking pool pays. Yours currently points at your receiver
                contract, which is what makes automated claiming work. Only you can change it,
                and changing it back to your own address turns auto-claim off.
              </>
            }
          />
          <AddressRow
            label="Receiver contract"
            address={subscription.handler}
            explain={
              <>
                Deployed for you alone. It claims from the pool and forwards to your payout
                address, and it can do nothing else — no owner, no upgrade, and it cannot
                touch your staked principal.
              </>
            }
          />
          <AddressRow
            label="Pays out to"
            address={subscription.payout}
            explain={
              <>
                Where your rewards land. Fixed when the receiver was deployed and not editable
                afterwards — to pay a different address you turn auto-claim on again with that
                address, which creates a separate receiver.
              </>
            }
          />
        </div>
      ) : null}

      {auto && !tier.meetsMinimum ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
          Positions under {tier.threshold} are claimed once enough rewards have accumulated to be
          worth the gas, rather than every week. Timing is at the operator&apos;s discretion. There
          is no minimum in the contract and nothing here is gated — only the cadence changes.
        </p>
      ) : null}
    </div>
  );
}
