/**
 * Live validator statistics.
 *
 * The Endur dashboard API is our own, so this is not an independent source and
 * the page never claims it is. What it is, is checkable: the same endpoint is
 * public, and every figure links to a place you can confirm it.
 *
 * The endpoint sends `access-control-allow-origin: *`, so the browser calls it
 * directly and no proxy is needed.
 */
import { VALIDATOR } from "./config";

const API =
  "https://api.dashboard.endur.fi/api/query/validators?page=1&per_page=400&sort_by=total_stake&sort_order=desc";

type RawValidator = {
  address: string;
  name: string | null;
  commission: string;
  total_stake: string;
  total_stake_btc: string;
  delegators_count: number;
  delegators_count_btc: number;
  liveliness: number;
  apy: number;
  btc_apy: number;
  is_active: boolean;
  active_since: string;
  pool_address: string;
};

export type ValidatorStats = {
  btcRank: number;
  btcOf: number;
  stakeRank: number;
  activeCount: number;
  strkStaked: number;
  btcStaked: number;
  commission: number;
  liveliness: number;
  delegators: number;
  btcDelegators: number;
  apy: number;
  btcApy: number;
  activeSince: string;
  live: boolean;
};

/**
 * Last known good values, shown only when the live call cannot complete. The UI
 * always says which of the two it is displaying — a stale number presented as
 * live would undercut the whole point of the page.
 */
export const FALLBACK: ValidatorStats = {
  btcRank: 3,
  btcOf: 42,
  stakeRank: 7,
  activeCount: 148,
  strkStaked: 80_881_008,
  btcStaked: 75.28,
  commission: 0,
  liveliness: 100,
  delegators: 83,
  btcDelegators: 22,
  apy: 7.74,
  btcApy: 2.58,
  activeSince: "2026-02-04T10:01:10.000Z",
  live: false,
};

export async function fetchValidatorStats(signal?: AbortSignal): Promise<ValidatorStats> {
  const res = await fetch(API, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`Endur API ${res.status}`);
  const { validators } = (await res.json()) as { validators: RawValidator[] };

  const me = validators.find((v) => v.name === VALIDATOR.name);
  if (!me) throw new Error("validator not found in response");

  const active = validators.filter((v) => v.is_active);

  // Rank among validators that actually accept Bitcoin delegation. This is the
  // segment the claim is about, and it is recomputed on every load rather than
  // hardcoded, because it moves.
  const btcRanked = active
    .filter((v) => Number(v.total_stake_btc) > 0)
    .sort((a, b) => Number(b.total_stake_btc) - Number(a.total_stake_btc));
  const btcRank = btcRanked.findIndex((v) => v.address === me.address) + 1;

  const stakeRanked = [...active].sort((a, b) => Number(b.total_stake) - Number(a.total_stake));
  const stakeRank = stakeRanked.findIndex((v) => v.address === me.address) + 1;

  return {
    btcRank,
    btcOf: btcRanked.length,
    stakeRank,
    activeCount: active.length,
    strkStaked: Number(me.total_stake) / 1e18,
    btcStaked: Number(me.total_stake_btc) / 1e8,
    commission: Number(me.commission),
    liveliness: me.liveliness,
    delegators: me.delegators_count,
    btcDelegators: me.delegators_count_btc,
    apy: me.apy,
    btcApy: me.btc_apy,
    activeSince: me.active_since,
    live: true,
  };
}
