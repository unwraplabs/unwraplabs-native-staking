import { describe, expect, it } from "vitest";
import { compact, fromUnits, normalizeAddress, num, sameAddress, shortHex } from "@/lib/format";

describe("fromUnits", () => {
  it("scales by token decimals", () => {
    expect(fromUnits(1_000_000_000_000_000_000n, 18)).toBe(1);
    // WBTC is 8 decimals, SolvBTC is 18. Getting this wrong is a 10-order-of-
    // magnitude display error, so both are pinned.
    expect(fromUnits(7_528_232_364n, 8)).toBeCloseTo(75.28232364, 6);
    expect(fromUnits(130_434n, 8)).toBeCloseTo(0.00130434, 8);
  });

  it("keeps precision on values beyond Number.MAX_SAFE_INTEGER", () => {
    // 80.88M STRK in wei is far past 2^53; a naive Number() conversion loses
    // the low digits before the division ever happens.
    expect(fromUnits(80_881_008_899_474_844_686_399_277n, 18)).toBeCloseTo(80_881_008.9, 1);
  });
});

describe("compact", () => {
  it("abbreviates at each threshold", () => {
    expect(compact(80_881_008, 1)).toBe("80.9M");
    expect(compact(1_500, 1)).toBe("1.5K");
    expect(compact(75.28, 1)).toBe("75.3");
  });
});

describe("address handling", () => {
  it("pads to the full 66-character form", () => {
    expect(normalizeAddress("0x1")).toBe(`0x${"0".repeat(63)}1`);
  });

  it("treats padded and unpadded forms as the same address", () => {
    // The chain returns unpadded felts and the config stores padded hex. If
    // this comparison were string equality, every subscription would read as
    // inactive and the keeper would silently skip everyone.
    expect(sameAddress("0x01", "0x1")).toBe(true);
    expect(
      sameAddress(
        "0x024ed354f5b69825100a1833248bb773ef11722b8b1efc845b97acc5976695c2",
        "0x24ed354f5b69825100a1833248bb773ef11722b8b1efc845b97acc5976695c2",
      ),
    ).toBe(true);
    expect(sameAddress("0x1", "0x2")).toBe(false);
    expect(sameAddress(undefined, "0x1")).toBe(false);
  });

  it("shortens for display without losing the ends", () => {
    expect(shortHex("0x024ed354f5b69825100a1833248bb773ef11722b8b1efc845b97acc5976695c2")).toBe(
      "0x024e…95c2",
    );
  });
});

describe("num", () => {
  it("formats with fixed decimals for tabular alignment", () => {
    expect(num(100, 2)).toBe("100.00");
    expect(num(0, 0)).toBe("0");
  });
});
