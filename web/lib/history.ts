/**
 * Claim history, read from the handler's own events.
 *
 * Each handler belongs to exactly one delegator, so its event log *is* that
 * delegator's statement — no filtering by user, no attribution, no indexer.
 * This is the payoff of the per-user instance design.
 */
import { hash, num } from "starknet";
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
 * Every event this handler has emitted, newest first.
 *
 * `fromBlock` defaults to 0 because handlers are young and sparse; if that ever
 * gets slow, pass the deployment block. The RPC paginates via
 * `continuation_token`, which is followed to the end so nothing is silently
 * truncated — a partial history shown as complete would be worse than none.
 */
export async function fetchHistory(handler: string, fromBlock = 0): Promise<HistoryEntry[]> {
  const p = provider();
  const entries: HistoryEntry[] = [];
  let continuation: string | undefined;

  do {
    const page = await p.getEvents({
      address: handler,
      from_block: { block_number: fromBlock },
      to_block: "latest",
      chunk_size: 100,
      continuation_token: continuation,
    });

    for (const e of page.events) {
      const selector = e.keys[0];
      const blockNumber = (e as { block_number?: number }).block_number ?? 0;
      const txHash = e.transaction_hash;

      if (selector === KEYS.claimed) {
        entries.push({
          kind: "claimed",
          txHash,
          blockNumber,
          amountIn: u256(e.data[0], e.data[1]),
        });
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

    continuation = page.continuation_token;
  } while (continuation);

  return entries.reverse();
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
