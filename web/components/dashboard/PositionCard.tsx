"use client";

import { useId, useState } from "react";
import {
  CaretIcon,
  ClaimIcon,
  CloseIcon,
  StakeIcon,
  SwitchIcon,
  UnstakeIcon,
} from "@/components/Icons";
import { TokenIcon } from "@/components/TokenIcon";
import { Tooltip } from "@/components/Tooltip";
import { explorerContract, explorerTx } from "@/lib/config";
import {
  exactUnits,
  formatUnits,
  fromUnits,
  num,
  parseUnits,
  shortHex,
  unitsToInput,
  usd,
} from "@/lib/format";
import { serviceTier, stakedAmount, stakedUsd } from "@/lib/positions";
import { summarise, type HistoryEntry } from "@/lib/history";
import { ActivitySkeleton } from "./Skeleton";
import type { Prices } from "@/lib/prices";
import type { PoolPosition, Subscription } from "@/lib/subscriptions";

/** Shared by every bordered control on the card. */
const SECONDARY =
  "flex items-center justify-center gap-2 h-[38px] px-2.5 rounded-lg border border-card-line " +
  "text-[13.5px] text-card-ink/80 transition-colors hover:bg-card-tint hover:border-card-edge " +
  "hover:text-card-ink disabled:opacity-100 disabled:border-card-hair disabled:text-card-dim " +
  "disabled:hover:bg-transparent";

function Figure({
  label,
  value,
  unit,
  sub,
  zero,
  exact,
}: {
  label: string;
  value: string;
  /** Every digit, for the tooltip — the display may be compacted or subscripted. */
  exact?: string;
  unit?: string;
  sub?: React.ReactNode;
  /** A figure with nothing in it. Greys out, so an empty position reads as
   *  empty at a glance without having to parse the digits. */
  zero?: boolean;
}) {
  // Long values step down a size rather than overflowing their column.
  // Derived from the string, so it holds for any token's formatting.
  const size = value.length > 7 ? "text-[27px]" : "text-[34px]";

  return (
    <div className="flex min-w-0 flex-col gap-[7px]">
      <div className="text-[12.5px] text-card-mute">{label}</div>
      {/* Fixed height, and the sub-line always occupies a row even when there
          is nothing to put in it. Every figure on every card is then exactly
          as tall as every other, so the rule under them lands at the same y
          whatever the step-down did or whether a USD value was available. */}
      <div
        className={`tnum flex h-[34px] min-w-0 items-baseline gap-x-[7px] ${
          zero ? "text-card-dim" : ""
        }`}
      >
        <div
          className={`mono ${size} font-medium leading-none tracking-[-0.025em]`}
          title={exact && unit ? `${exact} ${unit}` : undefined}
        >
          {value}
        </div>
        {unit ? (
          <div className={`text-[13px] ${zero ? "" : "text-card-mute"}`}>{unit}</div>
        ) : null}
      </div>
      <div className="text-[12.5px] text-card-mute">{sub ?? "\u00A0"}</div>
    </div>
  );
}

/**
 * The auto-claim switch.
 *
 * Driven entirely by the subscription read back from chain, never by local
 * state: an optimistic flip would show "on" for a transaction that can still
 * revert, which is exactly the thing a delegator must be able to trust here.
 * While a transaction is in flight it is disabled and keeps showing the truth.
 */
function AutoClaimSwitch({
  on,
  busy,
  empty,
  symbol,
  onChange,
}: {
  on: boolean;
  busy: boolean;
  /** Nothing staked in this pool. */
  empty: boolean;
  symbol: string;
  onChange: () => void;
}) {
  const disabled = busy || empty;
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label="Automated claiming"
      disabled={disabled}
      onClick={onChange}
      title={
        busy
          ? "Waiting on the transaction you just sent"
          : empty
            ? `Stake ${symbol} first — there is nothing here to claim from yet`
            : on
              ? "Turn off auto-claim"
              : "Auto-claim works at any size — there is no minimum"
      }
      className={`relative h-5 w-9 flex-none rounded-full border transition-colors duration-150 disabled:opacity-50 ${
        on ? "border-card-ink bg-card-ink" : "border-card-edge bg-white"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 block h-3.5 w-3.5 rounded-full transition-[transform,background-color] duration-150 ${
          on ? "translate-x-4 bg-white" : "translate-x-0 bg-card-dim"
        }`}
      />
    </button>
  );
}

/**
 * Inline amount entry. Replaces its own trigger button in place rather than
 * opening a panel under the card, so the field appears exactly where the
 * delegator's eye already is.
 *
 * Controlled by the card: the card owns the value because the hint line that
 * explains it (balance, or what is wrong) sits below the whole action stack.
 */
function AmountEditor({
  size,
  action,
  symbol,
  value,
  onChange,
  balance,
  chip,
  onChip,
  invalid,
  canSubmit,
  busy,
  hintId,
  onSubmit,
  onCancel,
}: {
  /** `lg` stands in for the 44px Stake button, `sm` for the 38px row. */
  size: "lg" | "sm";
  action: "Stake" | "Unstake";
  symbol: string;
  value: string;
  onChange: (value: string) => void;
  /** What can go in, shown in the field as "/ 7.17" so the ceiling is visible
   *  while typing rather than only after going over it. */
  balance: string;
  /** Chip label, e.g. "MAX". Omitted when there is nothing to fill in. */
  chip?: string;
  onChip: () => void;
  invalid: boolean;
  canSubmit: boolean;
  busy: boolean;
  hintId: string;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const lg = size === "lg";
  return (
    <div className={`flex items-stretch gap-2 ${lg ? "h-11" : "h-[38px]"}`}>
      <div
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border pl-3 pr-1 ${
          invalid ? "border-btc" : "border-card-ink"
        }`}
      >
        <input
          autoFocus
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) onSubmit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="0.00"
          aria-label={`${action} amount in ${symbol}`}
          aria-invalid={invalid}
          aria-describedby={hintId}
          className={`tnum min-w-0 flex-1 bg-transparent font-medium text-card-ink outline-none placeholder:text-card-dim ${
            lg ? "text-[15px]" : "text-[14px]"
          }`}
        />
        <span className="mono flex-none text-[12.5px] text-card-mute" aria-hidden>
          / {balance}
        </span>
        {chip ? (
          <button
            onClick={onChip}
            className={`flex-none rounded-md bg-card-tint px-2 text-[11px] font-medium tracking-[0.04em] text-card-ink/80 transition-colors hover:bg-card-line hover:text-card-ink ${
              lg ? "py-[5px]" : "py-1"
            }`}
          >
            {chip}
          </button>
        ) : null}
      </div>

      <button
        onClick={onSubmit}
        disabled={!canSubmit || busy}
        className={`flex-none rounded-lg border border-card-ink font-medium transition-colors disabled:opacity-40 ${
          lg
            ? "bg-card-ink px-[18px] text-[14px] text-white hover:bg-neutral-700"
            : "bg-white px-4 text-[13.5px] text-card-ink hover:bg-card-tint"
        }`}
      >
        {busy ? "Working…" : action}
      </button>

      <button
        onClick={onCancel}
        aria-label="Cancel"
        title="Cancel"
        className={`flex flex-none items-center justify-center rounded-lg border border-card-line bg-white text-card-mute transition-colors hover:border-card-edge hover:bg-card-tint hover:text-card-ink ${
          lg ? "w-11" : "w-[38px]"
        }`}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

/** Address row with an explanation, used for the addresses that matter. */
function AddressRow({
  label,
  address,
  explain,
}: {
  label: string;
  address: string;
  explain?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-[12.5px]">
      {explain ? (
        <Tooltip label={<span className="text-card-mute">{label}</span>}>{explain}</Tooltip>
      ) : (
        <span className="text-card-mute">{label}</span>
      )}
      <a
        href={explorerContract(address)}
        target="_blank"
        rel="noopener noreferrer"
        className="mono text-card-ink transition-colors hover:underline"
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
  const [amount, setAmount] = useState("");
  // Set by the MAX chip and cleared by any keystroke. While set, submit sends
  // the exact on-chain balance rather than the truncated figure shown in the
  // field — otherwise unstaking everything would leave a few wei of dust.
  const [whole, setWhole] = useState(false);
  const [details, setDetails] = useState(false);
  const hintId = useId();

  const staked = stakedAmount(position);
  const walletBalance = fromUnits(position.walletBalance, position.decimals);
  const value = stakedUsd(position, prices);
  const unclaimed = position.unclaimed ? fromUnits(position.unclaimed, 18) : 0;
  const auto = subscription?.active ?? false;
  // Nothing staked in this pool. Every control that acts on a position here is
  // meaningless in that state, so they go dead. Stake and Switch stay live:
  // both bring stake *in*, and an empty pool is exactly where a delegator
  // moving over from another validator starts.
  //
  // TODO: check if accounts close after positions close / verify how it works.
  // If the pool drops a member on full exit, `staked === 0` and "never joined"
  // become indistinguishable here, and a delegator who exits with auto-claim
  // still on would find the switch greyed out with their receiver still
  // installed as the pool's reward address.
  const empty = staked === 0;
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

  const loadingActivity = auto && subscription && historyLoading && !history;

  // The open editor, in exact base units throughout. Floats are only ever used
  // for display above; nothing that becomes calldata passes through one.
  const limit = form === "unstake" ? (position.staked ?? 0n) : position.walletBalance;
  const dp = position.symbol === "STRK" ? 2 : 6;
  // What MAX puts in the field: plain digits, since a subscript would not parse
  // back. Normally truncated to dp; but a balance too small to survive that
  // (0.0004 STRK at 2dp is "0.00") goes in whole, or the field would read zero.
  const truncated = unitsToInput(limit, position.decimals, dp);
  const fill =
    limit > 0n && parseUnits(truncated, position.decimals) === 0n
      ? exactUnits(limit, position.decimals)
      : truncated;
  // What the field and hint show as the ceiling.
  const ceiling = formatUnits(limit, position.decimals, dp);
  const parsed = whole ? limit : parseUnits(amount, position.decimals);
  const malformed = amount.trim() !== "" && parsed === null;
  const tooMuch = parsed !== null && parsed > limit;
  const canSubmit = parsed !== null && parsed > 0n && !tooMuch;

  const open = (next: "stake" | "unstake" | null) => {
    setForm(next);
    setAmount("");
    setWhole(false);
  };
  const submit = () => {
    if (!canSubmit || parsed === null) return;
    if (form === "stake") onStake(parsed);
    if (form === "unstake") onUnstake(parsed);
    open(null);
  };

  // One line under the whole stack. Reserved even when empty, so opening an
  // editor never shifts the Details rule below it.
  const hint: { text: string; error?: boolean } | null =
    form !== null && malformed
      ? { text: `Not a valid ${position.symbol} amount`, error: true }
      : form === "stake"
        ? tooMuch
          ? { text: `More than you have — ${ceiling} ${position.symbol} in your wallet`, error: true }
          : { text: `In your wallet ${ceiling} ${position.symbol}` }
        : form === "unstake"
          ? tooMuch
            ? { text: `More than you have staked — ${ceiling} ${position.symbol}`, error: true }
            : { text: "Unstaking stops rewards on that amount" }
          : empty
            ? { text: "Nothing staked yet" }
            : null;

  return (
    <div className="flex min-w-0 flex-col gap-[26px] rounded-lg border border-card-line bg-white p-7 text-card-ink">
      <div className="flex items-center gap-3">
        <TokenIcon src={position.icon} symbol={position.symbol} size={30} />
        <h3 className="text-[19px] font-medium tracking-[-0.01em]">{position.symbol}</h3>
        <span className="tnum ml-auto text-[13px] text-card-mute">
          {apr !== undefined ? `APR ${num(apr, 2)}%` : null}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-7">
        <Figure
          label="Staked"
          value={formatUnits(position.staked ?? 0n, position.decimals)}
          exact={exactUnits(position.staked ?? 0n, position.decimals)}
          unit={position.symbol}
          sub={value !== null ? `≈ ${usd(value)}` : undefined}
          zero={staked === 0}
        />
        <Figure
          label="Unclaimed rewards"
          value={formatUnits(position.unclaimed ?? 0n, 18)}
          exact={exactUnits(position.unclaimed ?? 0n, 18)}
          unit="STRK"
          sub={swapsToBtc ? `Swapped to ${position.symbol} on claim` : "Paid as STRK"}
          zero={unclaimed === 0}
        />
      </div>

      {/* Auto-claim leads the lower half of the card: it is the thing this
          service exists to do, and it is a control rather than a status. */}
      <div className="flex flex-col gap-2.5 border-t border-card-hair pt-[22px]">
        <div className="flex items-center gap-3">
          <AutoClaimSwitch
            on={auto}
            busy={busy}
            empty={empty}
            symbol={position.symbol}
            onChange={auto ? onUnsubscribe : onSubscribe}
          />
          <div className="text-[14px] font-medium">Auto-claim {auto ? "ON" : "OFF"}</div>
          {auto && summary.runs > 0 ? (
            <div className="tnum ml-auto text-[12.5px] text-card-mute">
              {summary.runs} {summary.runs === 1 ? "payout" : "payouts"}
            </div>
          ) : null}
        </div>

        {loadingActivity ? <ActivitySkeleton /> : null}

        {auto && subscription && !loadingActivity ? (
          summary.runs === 0 && summary.claimed === 0n ? (
            <p className="text-[12.5px] leading-relaxed text-card-mute">
              Nothing claimed yet. The next scheduled run will pick up your rewards, or you can
              claim now and have them sent straight through.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="text-[12.5px] text-card-mute">Since you turned it on</div>
              <div className="flex flex-wrap gap-x-10 gap-y-3">
                <div className="flex flex-col gap-1">
                  <div className="text-[12.5px] text-card-mute">Claimed from the pool</div>
                  <div className="tnum text-[15px] font-semibold">
                    {formatUnits(summary.claimed, 18)} STRK
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-[12.5px] text-card-mute">Sent to you</div>
                  <div className="tnum text-[15px] font-semibold">
                    {formatUnits(paidOut, paidOutDecimals, paidOutSymbol === "STRK" ? 2 : 6)}{" "}
                    {paidOutSymbol}
                  </div>
                </div>
              </div>
              {summary.lastTxHash ? (
                <a
                  href={explorerTx(summary.lastTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-wrap gap-2 text-[12.5px] text-card-mute transition-colors hover:text-card-ink"
                >
                  <span>Last run</span>
                  {summary.lastBlock ? (
                    <span className="mono">block {summary.lastBlock}</span>
                  ) : null}
                </a>
              ) : null}
            </div>
          )
        ) : null}

        {!auto ? (
          <p className="text-[12.5px] leading-relaxed text-card-mute">
            Rewards sit in the pool until you claim them yourself.
          </p>
        ) : null}
      </div>

      <div className="mt-auto flex flex-col gap-3">
        {form === "stake" ? (
          <AmountEditor
            size="lg"
            action="Stake"
            symbol={position.symbol}
            value={amount}
            onChange={(v) => {
              setAmount(v);
              setWhole(false);
            }}
            balance={ceiling}
            chip={position.walletBalance > 0n ? "MAX" : undefined}
            onChip={() => {
              setAmount(fill);
              setWhole(true);
            }}
            invalid={malformed || tooMuch}
            canSubmit={canSubmit}
            busy={busy}
            hintId={hintId}
            onSubmit={submit}
            onCancel={() => open(null)}
          />
        ) : (
          <button
            onClick={() => open("stake")}
            // Never disabled. Stake is the one way out of an empty position, so
            // it stays live even with an empty wallet — the editor then says
            // what the balance actually is, which a greyed-out button never could.
            title={
              walletBalance === 0 ? `No ${position.symbol} in this wallet yet` : undefined
            }
            className={`flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-card-ink text-[14px] font-medium text-white transition-[background-color,opacity] hover:bg-neutral-700 ${
              form === "unstake" ? "opacity-40" : ""
            }`}
          >
            <StakeIcon />
            Stake
          </button>
        )}

        {form === "unstake" ? (
          <AmountEditor
            size="sm"
            action="Unstake"
            symbol={position.symbol}
            value={amount}
            onChange={(v) => {
              setAmount(v);
              setWhole(false);
            }}
            balance={ceiling}
            chip="MAX"
            onChip={() => {
              setAmount(fill);
              setWhole(true);
            }}
            invalid={malformed || tooMuch}
            canSubmit={canSubmit}
            busy={busy}
            hintId={hintId}
            onSubmit={submit}
            onCancel={() => open(null)}
          />
        ) : (
          <div
            className={`grid grid-cols-2 gap-2.5 transition-opacity ${
              form === "stake" ? "opacity-40" : ""
            }`}
          >
            <button
              onClick={() => open("unstake")}
              disabled={empty}
              title={empty ? `Nothing staked to unstake` : undefined}
              className={SECONDARY}
            >
              <UnstakeIcon />
              Unstake
            </button>
            <button
              onClick={onClaim}
              disabled={busy || empty || unclaimed === 0}
              title={
                busy
                  ? "Waiting on the transaction you just sent"
                  : empty
                    ? `Stake ${position.symbol} first — there is nothing here to claim from yet`
                    : unclaimed === 0
                      ? "No rewards have accrued yet"
                      : undefined
              }
              className={SECONDARY}
            >
              <ClaimIcon />
              {auto ? "Claim now" : "Claim rewards"}
            </button>
          </div>
        )}

        <button
          onClick={onSwitch}
          disabled={busy}
          title={
            busy
              ? "Waiting on the transaction you just sent"
              : `Move ${position.symbol} here from another validator, in one transaction`
          }
          className={SECONDARY}
        >
          <SwitchIcon />
          Switch here
        </button>

        <div
          id={hintId}
          aria-live="polite"
          className={`min-h-[18px] text-[12px] ${hint?.error ? "text-btc" : "text-card-mute"}`}
        >
          {hint?.text}
        </div>
      </div>

      {/* The addresses and the cadence note. Collapsed by default: they are
          what a delegator checks once and then stops looking at, and leaving
          them open pushed the actions off the bottom of the card. */}
      <div className="border-t border-card-hair pt-4">
        <button
          onClick={() => setDetails(!details)}
          aria-expanded={details}
          className="flex w-full items-center gap-2 text-[13px] text-card-mute transition-colors hover:text-card-ink"
        >
          <span>Details</span>
          <span
            className={`inline-flex transition-transform duration-150 ${details ? "rotate-90" : ""}`}
          >
            <CaretIcon />
          </span>
        </button>

        <div hidden={!details} className="flex flex-col gap-3 pt-[18px]">
          {auto && subscription ? (
            <>
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
                    address, and it can do nothing else — no owner, no upgrade, and it cannot touch
                    your staked principal.
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
            </>
          ) : null}

          <AddressRow label="Pool contract" address={position.pool} />

          {auto && !tier.meetsMinimum ? (
            <p className="pt-1 text-[12.5px] leading-relaxed text-card-mute">
              Positions under {tier.threshold} are claimed once enough rewards have accumulated to
              be worth the gas, rather than every week. Timing is at the operator&apos;s discretion.
              There is no minimum in the contract and nothing here is gated — only the cadence
              changes.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
