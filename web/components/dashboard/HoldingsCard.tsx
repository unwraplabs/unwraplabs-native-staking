"use client";

import { Tooltip } from "@/components/Tooltip";
import { explorerContract } from "@/lib/config";
import { num, shortHex, usd } from "@/lib/format";
import type { Holdings } from "@/lib/holdings";
import type { Prices } from "@/lib/prices";

/**
 * What each relevant address is actually holding.
 *
 * Two lines per address on purpose. The point is a glance — "is my payout
 * address receiving anything?" — not a portfolio view, and a taller block here
 * would push the receiver details below the fold.
 */
function Row({
  label,
  holdings,
  prices,
  explain,
}: {
  label: string;
  holdings: Holdings;
  prices: Prices;
  explain?: React.ReactNode;
}) {
  const value =
    prices.strk !== null && prices.btc !== null
      ? holdings.strk * prices.strk + holdings.btc * prices.btc
      : null;

  return (
    <div className="border-b border-line-2 py-2.5 last:border-0">
      <div className="flex items-center justify-between gap-3">
        {explain ? (
          <Tooltip label={<span className="text-[12.5px] text-ink-2">{label}</span>}>
            {explain}
          </Tooltip>
        ) : (
          <span className="text-[12.5px] text-ink-2">{label}</span>
        )}
        <a
          href={explorerContract(holdings.address)}
          target="_blank"
          rel="noopener noreferrer"
          className="mono text-[12px] text-ink transition-colors hover:underline"
        >
          {shortHex(holdings.address)}
        </a>
      </div>
      <div className="mono mt-1 flex flex-wrap items-baseline gap-x-2.5 text-[13px]">
        <span>
          {num(holdings.strk, 2)}
          <span className="ml-1 text-[11px] text-ink-3">STRK</span>
        </span>
        <span className="text-ink-3">·</span>
        <span>
          {num(holdings.btc, 6)}
          <span className="ml-1 text-[11px] text-ink-3">BTC</span>
        </span>
        {value !== null ? <span className="text-[11.5px] text-ink-3">≈ {usd(value)}</span> : null}
      </div>
    </div>
  );
}

export function HoldingsCard({
  wallet,
  others,
  prices,
}: {
  wallet: Holdings | null;
  /** Payout or reward addresses that are not the connected wallet. */
  others: Array<{ label: string; holdings: Holdings }>;
  prices: Prices;
}) {
  if (!wallet) return null;

  return (
    <div className="border border-line p-5">
      <h3 className="text-[15px] font-semibold tracking-[-0.02em]">Holdings</h3>
      <div className="mt-2">
        <Row label="Connected wallet" holdings={wallet} prices={prices} />
        {others.map((o) => (
          <Row
            key={o.holdings.address}
            label={o.label}
            holdings={o.holdings}
            prices={prices}
            explain={
              <>
                Rewards from this pool are sent here rather than to the wallet you are connected
                with. It is worth checking that you control it — nothing in these contracts can
                change it after the receiver is deployed.
              </>
            }
          />
        ))}
      </div>
    </div>
  );
}
