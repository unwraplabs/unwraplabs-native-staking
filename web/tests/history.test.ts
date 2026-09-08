import { describe, expect, it } from "vitest";
import { summarise, totalsByToken, type HistoryEntry } from "@/lib/history";

const WBTC = "0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac";
const STRK = "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const claimed = (n: bigint, block: number): HistoryEntry => ({
  kind: "claimed",
  txHash: `0xc${block}`,
  blockNumber: block,
  amountIn: n,
});

const dispatched = (
  inAmt: bigint,
  outAmt: bigint,
  token: string,
  block: number,
): HistoryEntry => ({
  kind: "dispatched",
  txHash: `0xd${block}`,
  blockNumber: block,
  amountIn: inAmt,
  amountOut: outAmt,
  token,
});

describe("summarise", () => {
  it("reports zeros and no runs for a receiver that has never fired", () => {
    const s = summarise([]);
    expect(s.claimed).toBe(0n);
    expect(s.runs).toBe(0);
    expect(s.paidOut.size).toBe(0);
    expect(s.lastTxHash).toBeNull();
  });

  it("keeps claimed and paid-out separate", () => {
    // A BTC receiver claims STRK and pays BTC. Adding them, or deriving one
    // from the other, would be nonsense — they are different denominations.
    const s = summarise([claimed(1000n, 10), dispatched(1000n, 42n, WBTC, 10)]);
    expect(s.claimed).toBe(1000n);
    expect(s.paidOut.get(WBTC)).toBe(42n);
    expect(s.runs).toBe(1);
  });

  it("handles a claim in one run and its payout in a later one", () => {
    // The stranded case: a manual claim lands rewards in the receiver with no
    // call attached, and they go out on the next run. Counting a payout per
    // claim would over-report runs here.
    const s = summarise([claimed(500n, 5), claimed(700n, 9), dispatched(1200n, 60n, WBTC, 14)]);
    expect(s.claimed).toBe(1200n);
    expect(s.paidOut.get(WBTC)).toBe(60n);
    expect(s.runs).toBe(1);
    expect(s.lastBlock).toBe(14);
    expect(s.lastTxHash).toBe("0xd14");
  });

  it("accumulates across many runs and reports the most recent", () => {
    const s = summarise([
      claimed(100n, 1),
      dispatched(100n, 5n, WBTC, 1),
      claimed(200n, 20),
      dispatched(200n, 11n, WBTC, 20),
    ]);
    expect(s.claimed).toBe(300n);
    expect(s.paidOut.get(WBTC)).toBe(16n);
    expect(s.runs).toBe(2);
    expect(s.lastBlock).toBe(20);
  });

  it("tracks a pass-through receiver paying STRK", () => {
    const s = summarise([claimed(900n, 3), dispatched(900n, 900n, STRK, 3)]);
    expect(s.paidOut.get(STRK)).toBe(900n);
    expect(s.claimed).toBe(900n);
  });

  it("ignores sweeps when counting runs", () => {
    // A swept airdrop is not a reward payout and must not inflate the count.
    const s = summarise([
      { kind: "swept", txHash: "0xs1", blockNumber: 7, token: WBTC, amountOut: 3n },
      claimed(100n, 8),
      dispatched(100n, 4n, WBTC, 8),
    ]);
    expect(s.runs).toBe(1);
    expect(s.paidOut.get(WBTC)).toBe(4n);
  });
});

describe("totalsByToken", () => {
  it("sums only dispatches, per token", () => {
    const t = totalsByToken([
      claimed(100n, 1),
      dispatched(100n, 5n, WBTC, 1),
      dispatched(100n, 7n, STRK, 2),
    ]);
    expect(t.get(WBTC)).toBe(5n);
    expect(t.get(STRK)).toBe(7n);
  });
});
