import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";

describe("chain config", () => {
  it("carries an event-scan floor whenever a factory is deployed", () => {
    // Without this, fetchHistory walks the chain from genesis. On mainnet that
    // was 178 requests and 103 seconds per receiver, all returning empty pages
    // — the dashboard sat on a skeleton the whole time.
    if (!config.deployed.factory) return;
    expect(typeof config.deployed.deployedAtBlock).toBe("number");
    expect(config.deployed.deployedAtBlock).toBeGreaterThan(0);
  });

  it("keeps the scan floor plausible for Starknet mainnet", () => {
    if (!config.deployed.deployedAtBlock) return;
    expect(config.deployed.deployedAtBlock).toBeGreaterThan(1_000_000);
    expect(config.deployed.deployedAtBlock).toBeLessThan(100_000_000);
  });

  it("gives each out-token its own decimals", () => {
    const byDecimals = Object.fromEntries(config.outTokens.map((t) => [t.symbol, t.decimals]));
    // SolvBTC is 18 while the others are 8; conflating them is a 10^10 error.
    expect(byDecimals.SolvBTC).toBe(18);
    expect(byDecimals.WBTC).toBe(8);
    expect(byDecimals.strkBTC).toBe(8);
  });
});
