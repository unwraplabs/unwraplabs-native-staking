import { describe, expect, it } from "vitest";
import { serviceTier, sortPositions, stakedUsd } from "@/lib/positions";
import type { PoolPosition } from "@/lib/subscriptions";

const pos = (symbol: string, kind: "strk" | "btc", staked: bigint, decimals: number): PoolPosition => ({
  symbol,
  pool: `0x${symbol}`,
  token: `0x${symbol}t`,
  decimals,
  kind,
  member: true,
  staked,
  unclaimed: 0n,
  icon: "",
  walletBalance: 0n,
});

const STRK = (n: number) => pos("STRK", "strk", BigInt(n) * 10n ** 18n, 18);
const WBTC = (n: number) => pos("WBTC", "btc", BigInt(Math.round(n * 1e8)), 8);
const SOLV = (n: number) => pos("SolvBTC", "btc", BigInt(Math.round(n * 1e18)), 18);

const PRICES = { strk: 0.03, btc: 78_000 };
const NO_PRICES = { strk: null, btc: null };

describe("sortPositions", () => {
  it("orders held positions by USD value, largest first", () => {
    // 1 BTC = $78,000; 1,000,000 STRK = $30,000. Value order, not amount order.
    const sorted = sortPositions([STRK(1_000_000), WBTC(1)], PRICES);
    expect(sorted.map((p) => p.symbol)).toEqual(["WBTC", "STRK"]);
  });

  it("compares across differing decimals correctly", () => {
    // SolvBTC is 18 decimals and WBTC is 8. Comparing raw integers would put
    // SolvBTC first by a factor of 10^10.
    const sorted = sortPositions([SOLV(0.5), WBTC(2)], PRICES);
    expect(sorted.map((p) => p.symbol)).toEqual(["WBTC", "SolvBTC"]);
  });

  it("falls back to STRK first, then BTC by amount, when prices are missing", () => {
    // Without prices, USD is not comparable across assets, so we do not pretend.
    const sorted = sortPositions([WBTC(2), STRK(5), SOLV(3)], NO_PRICES);
    expect(sorted.map((p) => p.symbol)).toEqual(["STRK", "SolvBTC", "WBTC"]);
  });

  it("keeps unheld pools after held ones, in declared order", () => {
    const empty = { ...WBTC(0), member: false, staked: 0n };
    const sorted = sortPositions([empty, STRK(100)], PRICES);
    expect(sorted[0].symbol).toBe("STRK");
    expect(sorted[1].symbol).toBe("WBTC");
  });

  it("treats a member with a zero balance as unheld", () => {
    const sorted = sortPositions([pos("WBTC", "btc", 0n, 8), STRK(1)], PRICES);
    expect(sorted[0].symbol).toBe("STRK");
  });
});

describe("stakedUsd", () => {
  it("is null when the price feed is unavailable", () => {
    expect(stakedUsd(WBTC(1), NO_PRICES)).toBeNull();
  });

  it("scales by the token's own decimals", () => {
    expect(stakedUsd(WBTC(2), PRICES)).toBeCloseTo(156_000, 0);
    expect(stakedUsd(SOLV(2), PRICES)).toBeCloseTo(156_000, 0);
  });
});

describe("serviceTier", () => {
  it("uses the $100k threshold when prices are available", () => {
    expect(serviceTier(WBTC(2), PRICES).meetsMinimum).toBe(true);
    expect(serviceTier(WBTC(0.5), PRICES).meetsMinimum).toBe(false);
    expect(serviceTier(WBTC(2), PRICES).threshold).toBe("$100,000");
  });

  it("falls back to 1 BTC and 5M STRK when prices are missing", () => {
    expect(serviceTier(WBTC(1), NO_PRICES).meetsMinimum).toBe(true);
    expect(serviceTier(WBTC(0.9), NO_PRICES).meetsMinimum).toBe(false);
    expect(serviceTier(WBTC(1), NO_PRICES).threshold).toBe("1 BTC");

    expect(serviceTier(STRK(5_000_000), NO_PRICES).meetsMinimum).toBe(true);
    expect(serviceTier(STRK(4_000_000), NO_PRICES).meetsMinimum).toBe(false);
    expect(serviceTier(STRK(5_000_000), NO_PRICES).threshold).toBe("5M STRK");
  });

  it("never gates: the tier only decides the cadence message", () => {
    // A tiny position still returns a tier rather than throwing or excluding.
    expect(serviceTier(STRK(1), PRICES).meetsMinimum).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The Option<PoolMemberInfoV1> wire format.
//
// Decoded by hand rather than through an ABI, because the partial ABI we can
// write cannot describe the struct or the Timestamp inside it. Getting this
// wrong made every non-member look like a member with a zero balance, which
// routed staking to `add_to_delegation_pool` and reverted with "Pool member
// does not exist". These are the exact responses from the live STRK pool.
// ---------------------------------------------------------------------------

const OPTION_SOME = 0n;

function decode(res: string[]) {
  if (!res?.length || BigInt(res[0]) !== OPTION_SOME) return null;
  const present = res.length > 6 && BigInt(res[6]) === OPTION_SOME;
  return {
    rewardAddress: res[1],
    amount: BigInt(res[2]),
    unclaimedRewards: BigInt(res[3]),
    commission: Number(BigInt(res[4])),
    unpoolAmount: BigInt(res[5]),
    unpoolTime: present ? Number(BigInt(res[7])) : null,
  };
}

describe("pool member decoding", () => {
  it("reads Option::None as not a member", () => {
    expect(decode(["0x1"])).toBeNull();
  });

  it("reads a member with no pending exit", () => {
    const m = decode([
      "0x0",
      "0x231a4c6d71699948d48ec48035968b0f857c32f435433f9fc1a0e994ff8d555",
      "0x1f2842c75439ec5f34e",
      "0xb476b9062eb4224",
      "0x0",
      "0x0",
      "0x1",
    ])!;
    expect(m).not.toBeNull();
    expect(Number(m.amount) / 1e18).toBeCloseTo(9196, 0);
    expect(m.unpoolAmount).toBe(0n);
    expect(m.unpoolTime).toBeNull();
  });

  it("reads a member mid-exit, including the nested Option timestamp", () => {
    const m = decode([
      "0x0",
      "0xda4276c735bca89656646b8d0e4b88f7c62cd134f5b3b3ff6948e563577f41",
      "0x24a830756a17a1e4cdc6",
      "0x2a76759483b6fa77",
      "0x0",
      "0xa877839e675474fc689",
      "0x0",
      "0x6aa93470",
    ])!;
    expect(Number(m.amount) / 1e18).toBeCloseTo(173107.74, 1);
    // The amount already signalled for exit is what a switch can move without
    // a fresh intent, so it must survive decoding.
    expect(Number(m.unpoolAmount) / 1e18).toBeCloseTo(49722.64, 1);
    expect(m.unpoolTime).toBe(0x6aa93470);
  });

  it("does not mistake the Some discriminant for a falsy result", () => {
    // `Some` is variant 0. A truthiness check on res[0] would read every real
    // member as absent — the mirror image of the original bug.
    expect(decode(["0x0", "0x1", "0x0", "0x0", "0x0", "0x0", "0x1"])).not.toBeNull();
  });
});
