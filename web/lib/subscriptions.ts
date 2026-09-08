/**
 * Reading who is subscribed, without an indexer.
 *
 * The factory records every handler it deploys, indexed globally and by pool
 * member. That list is the *candidate* set. Whether a candidate is actually
 * live is decided by one further read: the pool's own `reward_address` for that
 * member. If it still points at the handler, the subscription is active. If the
 * delegator has repointed it, the handler is inert and we treat it as
 * unsubscribed — no bookkeeping on our side, no way for our records to disagree
 * with the chain.
 *
 * This is why there is no indexer and no database anywhere in this project.
 */
import { Contract, type Abi } from "starknet";
import factoryAbi from "./abi/factory.json";
import handlerAbi from "./abi/handler.json";
import { config, POOLS } from "./config";
import { normalizeAddress, sameAddress } from "./format";
import { provider } from "./starknet";

/**
 * Reading a pool member, by decoding felts rather than through an ABI.
 *
 * `get_pool_member_info_v1` returns `Option<PoolMemberInfoV1>`, and a
 * hand-written ABI cannot describe that: it names a struct and a Timestamp this
 * app has no definition for, so starknet.js cannot reliably tell `None` from
 * `Some`. It fell through to a truthy value, which made every non-member look
 * like a member with a zero balance — and then staking called
 * `add_to_delegation_pool` for someone who was not in the pool, which reverts
 * with "Pool member does not exist".
 *
 * The wire format is short and fixed, so decode it directly. Verified against
 * the live pool:
 *
 *   non-member : [1]                                    // Option::None
 *   member     : [0, reward_address, amount,
 *                 unclaimed_rewards, commission,
 *                 unpool_amount, ...unpool_time]        // Option::Some
 *
 * where `unpool_time` is itself an Option: `[1]` for none, `[0, timestamp]`
 * otherwise. Cairo orders `Option` as Some = 0, None = 1.
 */
export type PoolMember = {
  rewardAddress: string;
  amount: bigint;
  unclaimedRewards: bigint;
  commission: number;
  /** Already signalled for exit — this is what a switch can move immediately. */
  unpoolAmount: bigint;
  unpoolTime: number | null;
};

const OPTION_SOME = 0n;

export async function readPoolMember(
  pool: string,
  member: string,
): Promise<PoolMember | null> {
  let res: string[];
  try {
    res = (await provider().callContract({
      contractAddress: pool,
      entrypoint: "get_pool_member_info_v1",
      calldata: [member],
    })) as string[];
  } catch {
    // An unreachable pool is not the same as "not a member", but there is
    // nothing to show for this asset either way.
    return null;
  }

  if (!res?.length || BigInt(res[0]) !== OPTION_SOME) return null;

  const unpoolTimePresent = res.length > 6 && BigInt(res[6]) === OPTION_SOME;
  return {
    rewardAddress: normalizeAddress(res[1]),
    amount: BigInt(res[2]),
    unclaimedRewards: BigInt(res[3]),
    commission: Number(BigInt(res[4])),
    unpoolAmount: BigInt(res[5]),
    unpoolTime: unpoolTimePresent ? Number(BigInt(res[7])) : null,
  };
}

export type Subscription = {
  handler: string;
  pool: string;
  poolMember: string;
  payout: string;
  outToken: string;
  /** Symbol of the pool's staked asset, resolved from the config. */
  symbol: string;
  /** Live iff the pool's reward address still points at this handler. */
  active: boolean;
  /** The address the pool currently pays, whatever it is. */
  rewardAddress: string;
  /** STRK sitting in the handler right now, awaiting dispatch. */
  held: bigint;
};

/**
 * Reads an ERC20 balance, tolerating either casing.
 *
 * Starknet tokens are split between the snake_case standard and the older
 * camelCase one, and not every token we accept implements both. Trying one and
 * falling back is cheaper than maintaining a per-token list of which is which.
 */
export async function tokenBalance(token: string, account: string): Promise<bigint> {
  for (const entrypoint of ["balance_of", "balanceOf"]) {
    try {
      const res = (await provider().callContract({
        contractAddress: token,
        entrypoint,
        calldata: [account],
      })) as string[];
      if (!res?.length) continue;
      const low = BigInt(res[0]);
      const high = res.length > 1 ? BigInt(res[1]) : 0n;
      return low + (high << 128n);
    } catch {
      // Try the other casing before giving up.
    }
  }
  return 0n;
}

export type PoolPosition = {
  symbol: string;
  pool: string;
  token: string;
  decimals: number;
  kind: "strk" | "btc";
  /** Undefined when the wallet is not a member of this pool. */
  staked?: bigint;
  unclaimed?: bigint;
  rewardAddress?: string;
  /** Already signalled for exit; movable by a switch without a fresh intent. */
  unpoolAmount?: bigint;
  member: boolean;
  icon: string;
  /** The delegator's spendable balance of the staked token, for the max button. */
  walletBalance: bigint;
};

function factoryContract() {
  if (!config.deployed.factory) return null;
  return new Contract({
    abi: factoryAbi as Abi,
    address: config.deployed.factory,
    providerOrAccount: provider(),
  });
}

/**
 * Every pool this delegator is a member of, with balances. One RPC call per
 * pool; there are six, so this is cheap and needs no batching.
 */
export async function fetchPositions(account: string): Promise<PoolPosition[]> {
  const p = provider();
  const results = await Promise.all(
    POOLS.map(async (pool): Promise<PoolPosition> => {
      const base = {
        symbol: pool.symbol,
        pool: pool.pool,
        token: pool.token,
        decimals: pool.decimals,
        kind: pool.kind,
        icon: pool.icon,
      };
      // The wallet balance is wanted whether or not they are already a member —
      // it is what "how much can I stake" means, and someone with no position
      // is exactly who needs to see it. It is independent of the pool read, so
      // the two go together rather than one after the other.
      const [walletBalance, info] = await Promise.all([
        tokenBalance(pool.token, account),
        readPoolMember(pool.pool, account),
      ]);
      if (!info) return { ...base, member: false, walletBalance };
      return {
        ...base,
        member: true,
        walletBalance,
        staked: info.amount,
        unclaimed: info.unclaimedRewards,
        unpoolAmount: info.unpoolAmount,
        rewardAddress: info.rewardAddress,
      };
    }),
  );
  return results;
}

/** Every handler the factory has deployed for this delegator, with live status. */
export async function fetchSubscriptions(account: string): Promise<Subscription[]> {
  const factory = factoryContract();
  if (!factory) return [];

  const raw = (await factory.call("subscriptions_of", [account])) as any[];
  const list = Array.isArray(raw) ? raw : [];

  return Promise.all(
    list.map(async (s: any) => {
      const handler = normalizeAddress(s.handler);
      const pool = normalizeAddress(s.pool);
      const poolCfg = POOLS.find((p) => sameAddress(p.pool, pool));

      const [rewardAddress, held] = await Promise.all([
        currentRewardAddress(pool, account),
        heldBalance(handler),
      ]);

      return {
        handler,
        pool,
        poolMember: normalizeAddress(s.pool_member),
        payout: normalizeAddress(s.payout),
        outToken: normalizeAddress(s.out_token),
        symbol: poolCfg?.symbol ?? "Unknown",
        rewardAddress,
        // The single source of truth for "is auto-claim on".
        active: sameAddress(rewardAddress, handler),
        held,
      };
    }),
  );
}

async function currentRewardAddress(pool: string, member: string): Promise<string> {
  const info = await readPoolMember(pool, member);
  return info?.rewardAddress ?? "";
}

async function heldBalance(handler: string): Promise<bigint> {
  try {
    const contract = new Contract({
      abi: handlerAbi as Abi,
      address: handler,
      providerOrAccount: provider(),
    });
    const held = (await contract.call("held", [])) as any;
    return BigInt(held?.toString?.() ?? held ?? 0);
  } catch {
    // Not deployed yet: the delegator may have pointed their reward address at
    // a derived address before anyone paid to deploy it. That is a valid state.
    return 0n;
  }
}

/**
 * The address a handler *would* have for this configuration, derived before
 * anything is deployed. This is what makes single-transaction opt-in possible.
 */
export async function deriveHandlerAddress(args: {
  pool: string;
  poolMember: string;
  payout: string;
  outToken: string;
}): Promise<string | null> {
  const factory = factoryContract();
  if (!factory) return null;
  const addr = await factory.call("handler_address", [
    args.pool,
    args.poolMember,
    args.payout,
    args.outToken,
  ]);
  return normalizeAddress(addr as any);
}
