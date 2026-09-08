import { describe, expect, it } from "vitest";
import { parseRoutes, routesToCalldata } from "@/lib/avnu";

/**
 * `multi_route_swap` calldata header, followed by the route array. The handler
 * takes routes structurally, so getting this walk wrong means quoting the right
 * swap and then sending the wrong one.
 */
function header(routeCount: number): string[] {
  return [
    "0x1", // sell_token_address
    "0x64", // sell_token_amount.low
    "0x0", // sell_token_amount.high
    "0x2", // buy_token_address
    "0x0", // buy_token_amount.low
    "0x0", // .high
    "0x0", // buy_token_min_amount.low
    "0x0", // .high
    "0x3", // beneficiary
    "0x0", // integrator_fee_amount_bps
    "0x0", // integrator_fee_recipient
    `0x${routeCount.toString(16)}`, // routes_len
  ];
}

describe("parseRoutes", () => {
  it("reads a single hop with no extra params", () => {
    const routes = parseRoutes([...header(1), "0x1", "0x2", "0xdead", "0x174876e800", "0x0"]);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toEqual({
      token_from: "0x1",
      token_to: "0x2",
      exchange_address: "0xdead",
      percent: "0x174876e800",
      additional_swap_params: [],
    });
  });

  it("respects each route's variable-length params when finding the next one", () => {
    // The first route carries two extra params. A parser that assumed a fixed
    // stride would read the second route from the wrong offset and silently
    // produce a route to the wrong token.
    const routes = parseRoutes([
      ...header(2),
      "0x1", "0x9", "0xaaa", "0x174876e800", "0x2", "0xf1", "0xf2",
      "0x9", "0x2", "0xbbb", "0x174876e800", "0x0",
    ]);
    expect(routes).toHaveLength(2);
    expect(routes[0].additional_swap_params).toEqual(["0xf1", "0xf2"]);
    expect(routes[1].token_from).toBe("0x9");
    expect(routes[1].token_to).toBe("0x2");
    expect(routes[1].exchange_address).toBe("0xbbb");
  });

  it("refuses calldata with no routes rather than sending an empty swap", () => {
    expect(() => parseRoutes(header(0))).toThrow(/no routes/);
  });
});

describe("routesToCalldata", () => {
  it("round-trips through parseRoutes", () => {
    const original = [...header(2),
      "0x1", "0x9", "0xaaa", "0x174876e800", "0x2", "0xf1", "0xf2",
      "0x9", "0x2", "0xbbb", "0x174876e800", "0x0",
    ];
    const parsed = parseRoutes(original);
    // Serialising and re-parsing must be a fixed point, since this is exactly
    // what happens between the AVNU quote and the on-chain call.
    const encoded = routesToCalldata(parsed);
    expect(parseRoutes([...header(2).slice(0, 11), encoded[0], ...encoded.slice(1)])).toEqual(parsed);
  });

  it("prefixes the array length, as Serde expects", () => {
    const encoded = routesToCalldata([
      {
        token_from: "0x1",
        token_to: "0x2",
        exchange_address: "0xdead",
        percent: "0x1",
        additional_swap_params: ["0xa"],
      },
    ]);
    expect(encoded).toEqual(["1", "0x1", "0x2", "0xdead", "0x1", "1", "0xa"]);
  });
});
