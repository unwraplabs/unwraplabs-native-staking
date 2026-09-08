/**
 * AVNU quoting and route extraction.
 *
 * The handler takes `Array<Route>` in AVNU's flat encoding rather than an
 * opaque blob, so we need the route array itself, not a prebuilt call. AVNU's
 * build endpoint returns a ready-made `multi_route_swap` invocation; the routes
 * are recovered by walking its calldata, which is the same thing our existing
 * AVNU wrapper does.
 *
 * Used by the browser (for the "send it now" button) and by the keeper.
 */
const BASE = process.env.AVNU_API ?? "https://starknet.api.avnu.fi";

export type Route = {
  token_from: string;
  token_to: string;
  exchange_address: string;
  percent: string;
  additional_swap_params: string[];
};

export type Quote = {
  quoteId: string;
  sellAmount: bigint;
  buyAmount: bigint;
  routes: Route[];
};

/** Calldata layout of `multi_route_swap`; routes begin right after the length. */
const ROUTES_LEN_INDEX = 11;
const ROUTES_START = 12;

type BuildCall = { contractAddress: string; entrypoint: string; calldata: string[] };

export async function fetchQuote(args: {
  sellToken: string;
  buyToken: string;
  sellAmount: bigint;
  taker: string;
  excludeSources?: string[];
}): Promise<Quote> {
  const params = new URLSearchParams({
    sellTokenAddress: args.sellToken,
    buyTokenAddress: args.buyToken,
    sellAmount: `0x${args.sellAmount.toString(16)}`,
    takerAddress: args.taker,
  });
  // Haiko's solver quotes intermittently fail on-chain with InvalidOraclePrice,
  // which would revert the whole keeper run for one delegator.
  for (const s of args.excludeSources ?? ["Haiko(Solvers)"]) params.append("excludeSources", s);

  const res = await fetch(`${BASE}/swap/v2/quotes?${params}`);
  if (!res.ok) throw new Error(`AVNU quotes ${res.status}: ${await res.text()}`);
  const quotes = (await res.json()) as Array<{
    quoteId: string;
    sellAmount: string;
    buyAmount: string;
  }>;

  // Precision matters: a quote for a different sell amount is not our quote.
  const exact = quotes.filter((q) => BigInt(q.sellAmount) === args.sellAmount);
  const chosen = exact[0] ?? quotes[0];
  if (!chosen) throw new Error("no AVNU quote available");

  const routes = await fetchRoutes(chosen.quoteId, args.taker);
  return {
    quoteId: chosen.quoteId,
    sellAmount: BigInt(chosen.sellAmount),
    buyAmount: BigInt(chosen.buyAmount),
    routes,
  };
}

async function fetchRoutes(quoteId: string, taker: string): Promise<Route[]> {
  const res = await fetch(`${BASE}/swap/v2/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quoteId, takerAddress: taker, slippage: 0.01, includeApprove: false }),
  });
  if (!res.ok) throw new Error(`AVNU build ${res.status}: ${await res.text()}`);
  const { calls } = (await res.json()) as { calls: BuildCall[] };

  // Pick the swap by entrypoint rather than by position: whether an approve
  // call is included has changed before, and an index would silently parse the
  // wrong calldata if it changes again.
  const swap = calls.find((c) => c.entrypoint === "multi_route_swap") ?? calls[calls.length - 1];
  if (!swap) throw new Error("AVNU build returned no swap call");

  return parseRoutes(swap.calldata);
}

/** Exported for tests: walks `multi_route_swap` calldata back into routes. */
export function parseRoutes(calldata: string[]): Route[] {
  const len = Number(BigInt(calldata[ROUTES_LEN_INDEX]));
  if (!Number.isFinite(len) || len <= 0) throw new Error("AVNU build returned no routes");

  const routes: Route[] = [];
  let i = ROUTES_START;
  for (let n = 0; n < len; n++) {
    const paramsLen = Number(BigInt(calldata[i + 4]));
    routes.push({
      token_from: calldata[i],
      token_to: calldata[i + 1],
      exchange_address: calldata[i + 2],
      percent: calldata[i + 3],
      additional_swap_params:
        paramsLen > 0 ? calldata.slice(i + 5, i + 5 + paramsLen) : [],
    });
    // Each route is 5 fixed felts plus its variable-length params.
    i += 5 + paramsLen;
  }
  return routes;
}

/** Calldata form the handler's `dispatch(amount, min_out, routes)` expects. */
export function routesToCalldata(routes: Route[]): string[] {
  const out: string[] = [String(routes.length)];
  for (const r of routes) {
    out.push(
      r.token_from,
      r.token_to,
      r.exchange_address,
      r.percent,
      String(r.additional_swap_params.length),
      ...r.additional_swap_params,
    );
  }
  return out;
}
