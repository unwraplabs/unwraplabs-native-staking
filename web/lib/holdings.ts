/**
 * Token balances for an address, for the holdings summary.
 *
 * Shown for the connected wallet, and for the payout or reward address when
 * that is somewhere else — which is exactly when a delegator most wants to
 * check it, because it is the address they will not see in their own wallet.
 */
import { POOLS } from "./config";
import { fromUnits } from "./format";
import { tokenBalance } from "./subscriptions";

export type Holdings = {
  address: string;
  /** STRK, in whole tokens. */
  strk: number;
  /** Every BTC-denominated token summed — they are all ~1:1 with Bitcoin. */
  btc: number;
  /** Per-token detail, for the tooltip. */
  breakdown: Array<{ symbol: string; amount: number }>;
};

export async function fetchHoldings(address: string): Promise<Holdings> {
  const balances = await Promise.all(
    POOLS.map(async (p) => ({
      symbol: p.symbol,
      kind: p.kind,
      amount: fromUnits(await tokenBalance(p.token, address), p.decimals),
    })),
  );

  return {
    address,
    strk: balances.find((b) => b.symbol === "STRK")?.amount ?? 0,
    btc: balances.filter((b) => b.kind === "btc").reduce((a, b) => a + b.amount, 0),
    breakdown: balances.filter((b) => b.amount > 0).map(({ symbol, amount }) => ({ symbol, amount })),
  };
}
