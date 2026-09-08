/**
 * USD prices, from the Troves price proxy.
 *
 * Only STRK and WBTC are fetched. Every Bitcoin asset we accept is priced off
 * WBTC — the same reference the receiver contract uses for its swap floor — so
 * the figure on screen can never disagree with the bound the contract enforces.
 * (The proxy has no working SolvBTC route, which is the other reason not to ask
 * it for one.)
 *
 * Failure is silent by design: the UI hides money figures rather than showing a
 * guess, and thresholds fall back to fixed token amounts.
 */
const BASE = "https://proxy.api.troves.fi/api/price";

export type Prices = { strk: number | null; btc: number | null };

async function price(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`${BASE}/${symbol}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { price?: number };
    return typeof body.price === "number" && body.price > 0 ? body.price : null;
  } catch {
    return null;
  }
}

export async function fetchPrices(): Promise<Prices> {
  const [strk, btc] = await Promise.all([price("STRK"), price("WBTC")]);
  return { strk, btc };
}

export const priceFor = (kind: "strk" | "btc", prices: Prices): number | null =>
  kind === "btc" ? prices.btc : prices.strk;
