/**
 * Ordering and service-threshold logic, kept out of the components so both are
 * testable without a browser.
 */
import { POOLS, SERVICE_MINIMUM_FALLBACK, SERVICE_MINIMUM_USD } from "./config";
import { fromUnits } from "./format";
import { priceFor, type Prices } from "./prices";
import type { PoolPosition } from "./subscriptions";

export const stakedAmount = (p: PoolPosition): number =>
  p.staked ? fromUnits(p.staked, p.decimals) : 0;

/** USD value of the position, or null when the price is unavailable. */
export function stakedUsd(p: PoolPosition, prices: Prices): number | null {
  const price = priceFor(p.kind, prices);
  return price === null ? null : stakedAmount(p) * price;
}

/**
 * Delegators see their largest position first.
 *
 * With prices, that is straightforwardly USD descending. Without them, USD is
 * not comparable across assets at all — 1 BTC and 1 STRK are not the same
 * question — so we fall back to a deterministic order instead of pretending:
 * STRK first, then the Bitcoin assets by amount staked.
 *
 * Positions the delegator does not hold keep the declared config order, so the
 * list is stable for someone with nothing staked yet.
 */
export function sortPositions(positions: PoolPosition[], prices: Prices): PoolPosition[] {
  const declared = new Map(POOLS.map((p, i) => [p.symbol, i]));
  const held = positions.filter((p) => p.member && stakedAmount(p) > 0);
  const rest = positions.filter((p) => !held.includes(p));

  const usdKnown = held.every((p) => stakedUsd(p, prices) !== null);

  held.sort((a, b) => {
    if (usdKnown) return (stakedUsd(b, prices) ?? 0) - (stakedUsd(a, prices) ?? 0);
    // No prices: STRK ahead of Bitcoin, then Bitcoin by amount.
    if (a.kind !== b.kind) return a.kind === "strk" ? -1 : 1;
    if (a.kind === "strk") return stakedAmount(b) - stakedAmount(a);
    return stakedAmount(b) - stakedAmount(a);
  });

  rest.sort((a, b) => (declared.get(a.symbol) ?? 99) - (declared.get(b.symbol) ?? 99));
  return [...held, ...rest];
}

export type ServiceTier = {
  /** True when this position is large enough for the dependable weekly run. */
  meetsMinimum: boolean;
  /** Human-readable threshold, e.g. "$100,000" or "1 BTC". */
  threshold: string;
};

/**
 * Whether a position clears the bar for weekly claiming.
 *
 * This gates nothing — auto-claim can be turned on at any size, and the
 * contract has no minimum. It only decides which sentence the UI shows about
 * cadence.
 */
export function serviceTier(p: PoolPosition, prices: Prices): ServiceTier {
  const usd = stakedUsd(p, prices);
  if (usd !== null) {
    return {
      meetsMinimum: usd >= SERVICE_MINIMUM_USD,
      threshold: `$${SERVICE_MINIMUM_USD.toLocaleString("en-US")}`,
    };
  }
  const amount = stakedAmount(p);
  if (p.kind === "btc") {
    return {
      meetsMinimum: amount >= SERVICE_MINIMUM_FALLBACK.btc,
      threshold: `${SERVICE_MINIMUM_FALLBACK.btc} BTC`,
    };
  }
  const strkMin = SERVICE_MINIMUM_FALLBACK.strk;
  return {
    meetsMinimum: amount >= strkMin,
    threshold:
      strkMin >= 1e6 ? `${(strkMin / 1e6).toFixed(0)}M STRK` : `${strkMin} STRK`,
  };
}
