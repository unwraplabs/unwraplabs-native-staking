/**
 * The validator directory, for switching delegation in.
 *
 * Every validator on Starknet runs one delegation pool per asset it accepts, so
 * "switch my WBTC" and "switch my STRK" are different destinations even for the
 * same validator. This flattens the Endur directory into
 * (validator, asset) -> pool, which is the shape the switch call needs.
 */
import { VALIDATOR } from "./config";
import { sameAddress } from "./format";

const API =
  "https://api.dashboard.endur.fi/api/query/validators?page=1&per_page=400&sort_by=total_stake&sort_order=desc";

export type ValidatorPool = {
  name: string;
  /** The staker address — `to_staker` in the switch call. */
  staker: string;
  /** That staker's delegation pool for this asset — `to_pool`. */
  pool: string;
  /** Total delegated to this pool, in the asset's own units. */
  totalStaked: number;
  logo: string | null;
};

type RawBtcToken = {
  address: string;
  pool_address: string;
  total_staked: string;
};

type RawValidator = {
  address: string;
  name: string | null;
  pool_address: string;
  total_stake: string;
  total_stake_btc: string;
  is_active: boolean;
  logo: string | null;
  btc_tokens_info?: RawBtcToken[];
};

let cache: RawValidator[] | null = null;

async function directory(): Promise<RawValidator[]> {
  if (cache) return cache;
  const res = await fetch(API, { cache: "no-store" });
  if (!res.ok) throw new Error(`validator directory ${res.status}`);
  const { validators } = (await res.json()) as { validators: RawValidator[] };
  cache = validators;
  return validators;
}

/**
 * Every validator a delegator could switch *from* for this asset.
 *
 * Ourselves excluded — the pool contract rejects a switch to the pool you are
 * already in, so offering it would only produce a confusing revert.
 */
export async function poolsForAsset(args: {
  kind: "strk" | "btc";
  token: string;
  decimals: number;
}): Promise<ValidatorPool[]> {
  const validators = await directory();
  const out: ValidatorPool[] = [];

  for (const v of validators) {
    if (!v.is_active) continue;
    if (sameAddress(v.address, VALIDATOR.address)) continue;

    if (args.kind === "strk") {
      if (!v.pool_address) continue;
      out.push({
        name: v.name || `${v.address.slice(0, 10)}…`,
        staker: v.address,
        pool: v.pool_address,
        totalStaked: Number(v.total_stake) / 10 ** args.decimals,
        logo: v.logo,
      });
      continue;
    }

    // A BTC validator has one pool per BTC token, so match on the token itself
    // rather than assuming a validator accepting "BTC" accepts this one.
    const entry = v.btc_tokens_info?.find((t) => sameAddress(t.address, args.token));
    if (!entry?.pool_address) continue;
    out.push({
      name: v.name || `${v.address.slice(0, 10)}…`,
      staker: v.address,
      pool: entry.pool_address,
      totalStaked: Number(entry.total_staked) / 10 ** args.decimals,
      logo: v.logo,
    });
  }

  return out.sort((a, b) => b.totalStaked - a.totalStaked);
}
