/**
 * The validator directory, for switching delegation in.
 *
 * Every validator on Starknet runs one delegation pool per asset it accepts, so
 * "switch my WBTC" and "switch my STRK" are different destinations even for the
 * same validator. This flattens the Endur directory into
 * (validator, asset) -> pool, which is the shape the switch call needs.
 */
import { VALIDATOR } from "./config";
import { sameAddress, shortHex } from "./format";

const BASE = "https://api.dashboard.endur.fi/api";
const API = `${BASE}/query/validators?page=1&per_page=400&sort_by=total_stake&sort_order=desc`;
/**
 * Curated names and logos. Many validators have no `name` in the directory at
 * all — Karnot, Braavos, Nethermind among them — and the Endur dashboard fills
 * them from here, preferring it over the directory. Without it they show as a
 * bare address.
 */
const WHITELIST = `${BASE}/validators/whitelist`;

export type ValidatorPool = {
  name: string;
  /** The staker address — `to_staker` in the switch call. */
  staker: string;
  /** That staker's delegation pool for this asset — `to_pool`. */
  pool: string;
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

type Listed = { address: string; name: string | null; logo: string | null };

let cache: RawValidator[] | null = null;

/** Names and logos by address. Best-effort: a failure costs names, not the list. */
async function whitelist(): Promise<Map<string, Listed>> {
  try {
    const res = await fetch(WHITELIST, { cache: "no-store" });
    if (!res.ok) return new Map();
    const { validators } = (await res.json()) as { validators: Listed[] };
    return new Map(validators.map((v) => [BigInt(v.address).toString(), v]));
  } catch {
    return new Map();
  }
}

async function directory(): Promise<RawValidator[]> {
  if (cache) return cache;
  const [res, listed] = await Promise.all([fetch(API, { cache: "no-store" }), whitelist()]);
  if (!res.ok) throw new Error(`validator directory ${res.status}`);
  const { validators } = (await res.json()) as { validators: RawValidator[] };
  // Same precedence as the dashboard: the whitelist's name and logo win.
  cache = validators.map((v) => {
    const hit = listed.get(BigInt(v.address).toString());
    return {
      ...v,
      name: hit?.name || v.name,
      logo: hit?.logo || v.logo,
    };
  });
  return cache;
}

/**
 * Every validator a delegator could switch *from* for this asset.
 *
 * Ourselves excluded — the pool contract rejects a switch to the pool you are
 * already in, so offering it would only produce a confusing revert.
 *
 * Ordered by each validator's overall `total_stake`, largest first — the same
 * order the Endur dashboard's own switch flow uses, and the order the API
 * already returns. Deliberately *not* by stake in this particular asset: that
 * reshuffled the list per token and made it disagree with the dashboard.
 */
export async function poolsForAsset(args: {
  kind: "strk" | "btc";
  token: string;
}): Promise<ValidatorPool[]> {
  const validators = [...(await directory())].sort(
    (a, b) => Number(b.total_stake) - Number(a.total_stake),
  );
  const out: ValidatorPool[] = [];

  for (const v of validators) {
    if (!v.is_active) continue;
    if (sameAddress(v.address, VALIDATOR.address)) continue;

    if (args.kind === "strk") {
      if (!v.pool_address) continue;
      out.push({
        name: v.name || shortHex(v.address),
        staker: v.address,
        pool: v.pool_address,
        logo: v.logo,
      });
      continue;
    }

    // A BTC validator has one pool per BTC token, so match on the token itself
    // rather than assuming a validator accepting "BTC" accepts this one.
    const entry = v.btc_tokens_info?.find((t) => sameAddress(t.address, args.token));
    if (!entry?.pool_address) continue;
    out.push({
      name: v.name || shortHex(v.address),
      staker: v.address,
      pool: entry.pool_address,
      logo: v.logo,
    });
  }

  return out;
}
