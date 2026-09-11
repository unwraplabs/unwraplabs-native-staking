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
  /**
   * The same two figures exactly, for display. The floats above are fine for
   * USD arithmetic but not for printing: display truncates, and 7.17 as a
   * double is 7.1699999…, which truncates to "7.16".
   */
  strkUnits: bigint;
  /** BTC tokens carry 8 or 18 decimals; summed here at {@link HOLDINGS_DECIMALS}. */
  btcUnits: bigint;
  /** Per-token detail, for the tooltip. */
  breakdown: Array<{ symbol: string; amount: number }>;
};

/** The common scale the BTC tokens are summed at — the widest of them. */
export const HOLDINGS_DECIMALS = 18;

export async function fetchHoldings(address: string): Promise<Holdings> {
  const balances = await Promise.all(
    POOLS.map(async (p) => {
      const raw = await tokenBalance(p.token, address);
      return {
        symbol: p.symbol,
        kind: p.kind,
        amount: fromUnits(raw, p.decimals),
        scaled: raw * 10n ** BigInt(HOLDINGS_DECIMALS - p.decimals),
      };
    }),
  );
  const strk = balances.find((b) => b.symbol === "STRK");
  const btc = balances.filter((b) => b.kind === "btc");

  return {
    address,
    strk: strk?.amount ?? 0,
    btc: btc.reduce((a, b) => a + b.amount, 0),
    strkUnits: strk?.scaled ?? 0n,
    btcUnits: btc.reduce((a, b) => a + b.scaled, 0n),
    breakdown: balances.filter((b) => b.amount > 0).map(({ symbol, amount }) => ({ symbol, amount })),
  };
}
