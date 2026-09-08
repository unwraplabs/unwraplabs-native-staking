/**
 * Claim history, read from the handler's own events.
 *
 * Each handler belongs to exactly one delegator, so its event log *is* that
 * delegator's statement — no filtering by user, no attribution, no indexer.
 * This is the payoff of the per-user instance design.
 */
import { hash, num } from "starknet";
import { config } from "./config";
import { normalizeAddress } from "./format";
import { provider } from "./starknet";

export type HistoryEntry = {
  kind: "claimed" | "dispatched" | "swept";
  txHash: string;
  blockNumber: number;
  /** STRK claimed, or STRK spent on a dispatch. */
  amountIn?: bigint;
  /** What actually reached the delegator, measured on chain. */
  amountOut?: bigint;
  /** The token they were paid in. */
  token?: string;
};

const KEYS = {
  claimed: hash.getSelectorFromName("Claimed"),
  dispatched: hash.getSelectorFromName("Dispatched"),
  swept: hash.getSelectorFromName("Swept"),
};

const u256 = (low: string, high: string): bigint =>
  BigInt(num.toHex(low)) + (BigInt(num.toHex(high)) << 128n);

/**
 * The block to start event scans from.
 *
 * Scanning from genesis is not merely slow, it is unusable: the RPC walks in
 * ~82k-block chunks and returns an empty page with a continuation token for
 * each one, so a receiver with no events took 178 requests and 103 seconds to
 * report nothing. From the factory's deployment block it is a single request.
 *
 * No receiver can predate the factory that deploys it, so that block is a
 * sound floor. It is normally read from config, where the deploy script writes
 * it. When it is missing we find it by binary search over `getClassHashAt`
 * rather than falling back to zero — about two dozen requests, once per
 * session, instead of silently reintroducing the stall.
 */
let cachedFromBlock: Promise<number> | null = null;

export function historyFromBlock(): Promise<number> {
  if (cachedFromBlock) return cachedFromBlock;

  const configured = config.deployed.deployedAtBlock;
  if (typeof configured === "number" && configured > 0) {
    cachedFromBlock = Promise.resolve(configured);
    return cachedFromBlock;
  }

  cachedFromBlock = (async () => {
    const factory = config.deployed.factory;
    if (!factory) return 0;
    const p = provider();
    try {
      let lo = 0;
      let hi = await p.getBlockNumber();
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        try {
          await p.getClassHashAt(mid, factory);
          hi = mid;
        } catch {
          lo = mid + 1;
        }
      }
      return lo;
    } catch {
      return 0;
    }
  })();
  return cachedFromBlock;
}

/**
 * The node advances a fixed 81,920 blocks per `getEvents` call.
 *
 * Measured, not assumed: every `chunk_size` from 10 to 1024 returns a
 * continuation token exactly 81,920 blocks further on, and anything near 10,000
 * is rejected outright. `chunk_size` bounds events per page, not the block span.
 *
 * That matters because following continuation tokens is serial — one round trip
 * per window, in order. Since the step is fixed and known, the windows can be
 * computed up front and fetched at the same time instead.
 */
const BLOCK_WINDOW = 81_920;
const MAX_CONCURRENCY = 10;
const CHUNK_SIZE = 1000;

async function fetchWindow(handler: string, from: number, to: number) {
  const p = provider();
  const events: Array<{ keys: string[]; data: string[]; transaction_hash: string; block_number?: number }> = [];
  let continuation: string | undefined;

  // A single window can still overflow `chunk_size` if it is busy, so its own
  // pagination is followed to the end. In practice that is one call.
  do {
    const page = await p.getEvents({
      address: handler,
      from_block: { block_number: from },
      to_block: { block_number: to },
      chunk_size: CHUNK_SIZE,
      continuation_token: continuation,
    });
    events.push(...(page.events as never[]));
    continuation = page.continuation_token;
  } while (continuation);

  return events;
}

/** Runs `tasks` with a cap, so a long scan does not open hundreds of sockets. */
async function pooled<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Every event this handler has emitted, oldest first.
 *
 * Windows are fetched concurrently rather than by walking continuation tokens,
 * so the cost is roughly the slowest window instead of the sum of all of them.
 * Nothing is sampled or truncated: the windows tile the whole range, and each
 * one is drained.
 */
export async function fetchHistory(handler: string, fromBlock?: number): Promise<HistoryEntry[]> {
  const p = provider();
  const [from, head] = await Promise.all([
    fromBlock !== undefined ? Promise.resolve(fromBlock) : historyFromBlock(),
    p.getBlockNumber(),
  ]);

  const windows: Array<[number, number]> = [];
  for (let start = from; start <= head; start += BLOCK_WINDOW) {
    windows.push([start, Math.min(start + BLOCK_WINDOW - 1, head)]);
  }

  const pages = await pooled(
    windows.map(([a, b]) => () => fetchWindow(handler, a, b)),
    MAX_CONCURRENCY,
  );

  const entries: HistoryEntry[] = [];
  for (const page of pages) {
    for (const e of page) {
      const selector = e.keys[0];
      const blockNumber = e.block_number ?? 0;
      const txHash = e.transaction_hash;

      if (selector === KEYS.claimed) {
        entries.push({ kind: "claimed", txHash, blockNumber, amountIn: u256(e.data[0], e.data[1]) });
      } else if (selector === KEYS.dispatched) {
        // `token_out` is a keyed field, so it rides in keys[1], not data.
        entries.push({
          kind: "dispatched",
          txHash,
          blockNumber,
          token: normalizeAddress(e.keys[1]),
          amountIn: u256(e.data[0], e.data[1]),
          amountOut: u256(e.data[2], e.data[3]),
        });
      } else if (selector === KEYS.swept) {
        entries.push({
          kind: "swept",
          txHash,
          blockNumber,
          token: normalizeAddress(e.keys[1]),
          amountOut: u256(e.data[0], e.data[1]),
        });
      }
    }
  }

  // Windows are fetched out of order, so sort rather than relying on arrival.
  return entries.sort((a, b) => a.blockNumber - b.blockNumber);
}

/**
 * What this receiver has actually done, for the position card.
 *
 * `claimed` is STRK pulled out of the pool; `paidOut` is what reached the
 * delegator's address, measured on chain at the moment of the swap rather than
 * derived from `claimed`. They are deliberately separate numbers: for a BTC
 * receiver they are denominated in different tokens, and for any receiver a
 * claim can land in one week and go out in the next.
 */
export type ReceiverSummary = {
  /** STRK claimed from the pool, all time. */
  claimed: bigint;
  /** What actually reached `payout`, keyed by token. */
  paidOut: Map<string, bigint>;
  /** Number of payouts, which is the honest count of "times it ran for you". */
  runs: number;
  lastTxHash: string | null;
  lastBlock: number | null;
};

export function summarise(entries: HistoryEntry[]): ReceiverSummary {
  let claimed = 0n;
  const paidOut = new Map<string, bigint>();
  let runs = 0;
  let lastTxHash: string | null = null;
  let lastBlock: number | null = null;

  for (const e of entries) {
    if (e.kind === "claimed" && e.amountIn !== undefined) claimed += e.amountIn;
    if (e.kind === "dispatched" && e.token && e.amountOut !== undefined) {
      paidOut.set(e.token, (paidOut.get(e.token) ?? 0n) + e.amountOut);
      runs += 1;
    }
    // Entries arrive oldest-first, so the last one wins.
    if (e.blockNumber) {
      lastBlock = e.blockNumber;
      lastTxHash = e.txHash;
    }
  }

  return { claimed, paidOut, runs, lastTxHash, lastBlock };
}

/** Lifetime totals per payout token, for the "sent to you so far" figure. */
export function totalsByToken(entries: HistoryEntry[]): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const e of entries) {
    if (e.kind !== "dispatched" || !e.token || e.amountOut === undefined) continue;
    totals.set(e.token, (totals.get(e.token) ?? 0n) + e.amountOut);
  }
  return totals;
}
