"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "@starknet-react/core";
import { fetchQuote, routesToCalldata } from "@/lib/avnu";
import { config, POOLS, poolBySymbol } from "@/lib/config";
import { formatUnits, normalizeAddress, sameAddress } from "@/lib/format";
import { fetchHistory, type HistoryEntry } from "@/lib/history";
import {
  deriveHandlerAddress,
  fetchPositions,
  fetchSubscriptions,
  readPoolMember,
  tokenBalance,
  type PoolPosition,
  type Subscription,
} from "@/lib/subscriptions";
import { VALIDATOR } from "@/lib/config";
import type { ValidatorPool } from "@/lib/validators";
import { provider } from "@/lib/starknet";

export type DelegatorState = {
  positions: PoolPosition[];
  subscriptions: Subscription[];
  history: Record<string, HistoryEntry[]>;
  /**
   * Tracked per source rather than as one flag.
   *
   * Positions come from the staking pools, subscriptions from the factory, and
   * activity from each receiver's event log. Waiting for the slowest before
   * showing any of them meant a blank screen for as long as the worst request
   * took, so each renders the moment it arrives and the rest shows a skeleton.
   */
  loadingPositions: boolean;
  loadingSubscriptions: boolean;
  loadingHistory: boolean;
  error: string | null;
};

const EMPTY: DelegatorState = {
  positions: [],
  subscriptions: [],
  history: {},
  loadingPositions: false,
  loadingSubscriptions: false,
  loadingHistory: false,
  error: null,
};

const ZERO = "0x0";

/**
 * Wait for a transaction, but never indefinitely.
 *
 * `waitForTransaction` polls until the transaction resolves, which is correct
 * but unbounded: a stalled RPC or a transaction that never lands would hold the
 * `busy` flag forever, and the card would sit there with its actions greyed out
 * and no explanation. Capping the wait means the worst case is a stale display
 * that the next refresh corrects, rather than a dead UI.
 */
const CONFIRM_TIMEOUT_MS = 180_000;

async function confirm(txHash: string): Promise<void> {
  await Promise.race([
    provider().waitForTransaction(txHash),
    new Promise((resolve) => setTimeout(resolve, CONFIRM_TIMEOUT_MS)),
  ]).catch(() => {
    // A revert is surfaced by the caller's own error handling; swallowing it
    // here only prevents the wait itself from throwing past the timeout race.
  });
}


export function useDelegator() {
  const { address, account } = useAccount();
  const [state, setState] = useState<DelegatorState>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) {
      setState(EMPTY);
      return;
    }

    setState((s) => ({
      ...s,
      loadingPositions: true,
      loadingSubscriptions: true,
      loadingHistory: true,
      error: null,
    }));

    // Two independent reads, each committed to state as soon as it lands.
    const positions = fetchPositions(address)
      .then((positions) => {
        setState((s) => ({ ...s, positions, loadingPositions: false }));
      })
      .catch((e) => {
        setState((s) => ({ ...s, loadingPositions: false, error: message(e) }));
      });

    const subscriptions = fetchSubscriptions(address)
      .then(async (subscriptions) => {
        setState((s) => ({
          ...s,
          subscriptions,
          loadingSubscriptions: false,
          loadingHistory: subscriptions.length > 0,
        }));

        // Each receiver's log is fetched on its own and merged as it arrives, so
        // one slow handler cannot hold up the others.
        await Promise.all(
          subscriptions.map((sub) =>
            fetchHistory(sub.handler)
              .catch(() => [] as HistoryEntry[])
              .then((entries) => {
                setState((s) => ({
                  ...s,
                  history: { ...s.history, [sub.handler]: entries },
                }));
              }),
          ),
        );
        setState((s) => ({ ...s, loadingHistory: false }));
      })
      .catch((e) => {
        setState((s) => ({
          ...s,
          loadingSubscriptions: false,
          loadingHistory: false,
          error: message(e),
        }));
      });

    await Promise.allSettled([positions, subscriptions]);
  }, [address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const subscriptionFor = useCallback(
    (pool: string) => state.subscriptions.find((s) => sameAddress(s.pool, pool)),
    [state.subscriptions],
  );

  /**
   * Opt in. One signature.
   *
   * `change_reward_address` is the only call the pool requires, and only the
   * delegator may make it. We bundle `deploy_handler` into the same multicall
   * when the receiver does not exist yet — still one signature, and it saves
   * waiting on someone else to deploy.
   *
   * Bundling is safe to skip: an ERC20 balance at a counterfactual address is
   * just an entry in the token's map, so rewards sent before deployment are not
   * lost. The receiver picks them up the moment it exists.
   */
  const subscribe = useCallback(
    async (symbol: string, payoutOverride?: string) => {
      if (!account || !address) throw new Error("connect a wallet first");
      const pool = poolBySymbol(symbol);
      if (!pool) throw new Error(`unknown pool ${symbol}`);
      if (!config.deployed.factory) throw new Error("factory is not deployed yet");

      setBusy(symbol);
      try {
        // The receiver pays whoever the delegator names here, and that address
        // is baked into the receiver's address, so changing it produces a
        // different receiver rather than editing this one. Defaults to the
        // connected wallet.
        const payout = payoutOverride?.trim() ? payoutOverride.trim() : address;
        const outToken = pool.payoutToken ?? ZERO;
        const handler = await deriveHandlerAddress({
          pool: pool.pool,
          poolMember: address,
          payout,
          outToken,
        });
        if (!handler) throw new Error("could not derive the receiver address");

        const calls = [
          {
            contractAddress: pool.pool,
            entrypoint: "change_reward_address",
            calldata: [handler],
          },
        ];

        if (!(await isDeployed(handler))) {
          calls.push({
            contractAddress: config.deployed.factory,
            entrypoint: "deploy_handler",
            calldata: [pool.pool, address, payout, outToken],
          });
        }

        const { transaction_hash } = await account.execute(calls);
        await confirm(transaction_hash);
        return transaction_hash;
      } finally {
        // Cleared before the refresh, not after: re-reading chain state is a
        // read, and a slow RPC must never leave the card looking disabled.
        setBusy(null);
        void refresh();
      }
    },
    [account, address, refresh],
  );

  /**
   * Opt out. Also one signature, also only the delegator can make it — we are
   * not in this path at all, and cannot block it.
   */
  const unsubscribe = useCallback(
    async (symbol: string) => {
      if (!account || !address) throw new Error("connect a wallet first");
      const pool = poolBySymbol(symbol);
      if (!pool) throw new Error(`unknown pool ${symbol}`);

      setBusy(symbol);
      try {
        const { transaction_hash } = await account.execute([
          {
            contractAddress: pool.pool,
            entrypoint: "change_reward_address",
            calldata: [address],
          },
        ]);
        await confirm(transaction_hash);
        return transaction_hash;
      } finally {
        setBusy(null);
        void refresh();
      }
    },
    [account, address, refresh],
  );

  /**
   * Claim now.
   *
   * While auto-claim is on this routes through the receiver's
   * `claim_and_dispatch` rather than the pool's `claim_rewards`, so the rewards
   * land at the delegator's address in the same transaction. Claiming straight
   * from the pool would deposit them in the receiver with no call attached —
   * the stranded state — which is recoverable but pointless to walk into.
   *
   * For a swapping receiver the route must be quoted on what the receiver will
   * hold when `dispatch` runs — its balance *plus* what `claim()` is about to
   * pull in — not on its balance alone. The balance is normally zero (the keeper
   * sweeps it), and `dispatch` asserts a non-empty route before it swaps, so
   * quoting on the balance alone sent an empty route and reverted the whole
   * transaction with 'bad route'. This is the same sum the keeper quotes on.
   */
  const claimNow = useCallback(
    async (symbol: string) => {
      if (!account || !address) throw new Error("connect a wallet first");
      const pool = poolBySymbol(symbol);
      if (!pool) throw new Error(`unknown pool ${symbol}`);
      const sub = subscriptionFor(pool.pool);

      setBusy(symbol);
      try {
        const calls =
          sub?.active
            ? [
                {
                  contractAddress: sub.handler,
                  entrypoint: "claim_and_dispatch",
                  // TODO: check again. The route is now quoted on held + unclaimed,
                  // verified only by a read-only call against a live strkBTC
                  // receiver on mainnet. Confirm with a real Claim now on a BTC
                  // card once its rewards are large enough for AVNU to route
                  // (no route at 0.54 STRK; routes from ~10 STRK up).
                  calldata: await dispatchCalldata(sub, await heldAfterClaim(sub, address)),
                },
              ]
            : [
                {
                  contractAddress: pool.pool,
                  entrypoint: "claim_rewards",
                  calldata: [address],
                },
              ];

        const { transaction_hash } = await account.execute(calls);
        await confirm(transaction_hash);
        return transaction_hash;
      } finally {
        // Cleared before the refresh, not after: re-reading chain state is a
        // read, and a slow RPC must never leave the card looking disabled.
        setBusy(null);
        void refresh();
      }
    },
    [account, address, refresh, subscriptionFor],
  );

  /**
   * Stake more into a pool.
   *
   * `Amount` is `u128` in the pool contract, not `u256`, so it is one felt.
   * A first-time member calls `enter_delegation_pool` and names a reward
   * address; an existing one calls `add_to_delegation_pool`, which leaves their
   * reward address — and therefore any active subscription — untouched.
   */
  const stake = useCallback(
    async (symbol: string, amount: bigint, isMember: boolean) => {
      if (!account || !address) throw new Error("connect a wallet first");
      const pool = poolBySymbol(symbol);
      if (!pool) throw new Error(`unknown pool ${symbol}`);
      if (amount <= 0n) throw new Error("enter an amount");

      setBusy(symbol);
      try {
        const approve = {
          contractAddress: pool.token,
          entrypoint: "approve",
          calldata: [pool.pool, u256(amount).low, u256(amount).high],
        };
        const deposit = isMember
          ? {
              contractAddress: pool.pool,
              entrypoint: "add_to_delegation_pool",
              calldata: [address, amount.toString()],
            }
          : {
              contractAddress: pool.pool,
              entrypoint: "enter_delegation_pool",
              calldata: [address, amount.toString()],
            };

        const { transaction_hash } = await account.execute([approve, deposit]);
        await confirm(transaction_hash);
        return transaction_hash;
      } finally {
        setBusy(null);
        void refresh();
      }
    },
    [account, address, refresh],
  );

  /**
   * Signal intent to withdraw. The pool starts an exit window; the funds are
   * collected afterwards with `exit_delegation_pool_action`, which is what
   * `withdraw` below calls.
   */
  const unstake = useCallback(
    async (symbol: string, amount: bigint) => {
      if (!account || !address) throw new Error("connect a wallet first");
      const pool = poolBySymbol(symbol);
      if (!pool) throw new Error(`unknown pool ${symbol}`);
      if (amount <= 0n) throw new Error("enter an amount");

      setBusy(symbol);
      try {
        const { transaction_hash } = await account.execute([
          {
            contractAddress: pool.pool,
            entrypoint: "exit_delegation_pool_intent",
            calldata: [amount.toString()],
          },
        ]);
        await confirm(transaction_hash);
        return transaction_hash;
      } finally {
        setBusy(null);
        void refresh();
      }
    },
    [account, address, refresh],
  );

  /** Collect funds once the exit window has elapsed. */
  const withdraw = useCallback(
    async (symbol: string) => {
      if (!account || !address) throw new Error("connect a wallet first");
      const pool = poolBySymbol(symbol);
      if (!pool) throw new Error(`unknown pool ${symbol}`);

      setBusy(symbol);
      try {
        const { transaction_hash } = await account.execute([
          {
            contractAddress: pool.pool,
            entrypoint: "exit_delegation_pool_action",
            calldata: [address],
          },
        ]);
        await confirm(transaction_hash);
        return transaction_hash;
      } finally {
        setBusy(null);
        void refresh();
      }
    },
    [account, address, refresh],
  );

  /**
   * Move a delegation here from another validator, without unstaking first.
   *
   * The whole thing is one signature, which is not obvious from the pool's API.
   * `switch_delegation_pool` requires an exit intent to *exist* — it checks
   * `unpool_time.is_some()` and `amount <= unpool_amount`, with no check that
   * the exit window has elapsed. So signalling the intent and switching in the
   * same multicall satisfies it, and the stake never stops earning.
   *
   * Two details that are easy to get wrong:
   *
   *  - `exit_delegation_pool_intent(amount)` *sets* `unpool_amount`, it does not
   *    add to it. Calling it when a larger exit is already pending would shrink
   *    that exit, so it is skipped when enough is already signalled.
   *  - The switch carries the source pool's reward address to the destination,
   *    and the destination reverts with REWARD_ADDRESS_MISMATCH if the
   *    delegator is already a member there with a different one. When that
   *    applies, the source's reward address is aligned first — a call only the
   *    delegator can make, in the same transaction.
   */
  const switchDelegation = useCallback(
    async (symbol: string, source: ValidatorPool, amount: bigint) => {
      if (!account || !address) throw new Error("connect a wallet first");
      const pool = poolBySymbol(symbol);
      if (!pool) throw new Error(`unknown pool ${symbol}`);
      if (amount <= 0n) throw new Error("enter an amount");

      setBusy(symbol);
      try {
        const [there, here] = await Promise.all([
          readPoolMember(source.pool, address),
          readPoolMember(pool.pool, address),
        ]);
        if (!there) throw new Error(`no ${symbol} delegated to ${source.name}`);
        if (amount > there.amount + there.unpoolAmount) {
          throw new Error("more than you have delegated there");
        }

        const calls = [];

        if (here && !sameAddress(here.rewardAddress, there.rewardAddress)) {
          calls.push({
            contractAddress: source.pool,
            entrypoint: "change_reward_address",
            calldata: [here.rewardAddress],
          });
        }

        if (there.unpoolAmount < amount) {
          calls.push({
            contractAddress: source.pool,
            entrypoint: "exit_delegation_pool_intent",
            calldata: [amount.toString()],
          });
        }

        calls.push({
          contractAddress: source.pool,
          entrypoint: "switch_delegation_pool",
          calldata: [VALIDATOR.address, pool.pool, amount.toString()],
        });

        const { transaction_hash } = await account.execute(calls);
        await confirm(transaction_hash);
        return transaction_hash;
      } finally {
        // Cleared before the refresh, not after: re-reading chain state is a
        // read, and a slow RPC must never leave the card looking disabled.
        setBusy(null);
        void refresh();
      }
    },
    [account, address, refresh],
  );

  /**
   * The escape hatch: release held STRK unswapped. Restricted by the contract
   * to the delegator, so this only works from the payout or member address.
   */
  const escape = useCallback(
    async (sub: Subscription) => {
      if (!account) throw new Error("connect a wallet first");
      setBusy(sub.symbol);
      try {
        const { transaction_hash } = await account.execute([
          { contractAddress: sub.handler, entrypoint: "escape", calldata: [] },
        ]);
        await confirm(transaction_hash);
        return transaction_hash;
      } finally {
        setBusy(null);
        void refresh();
      }
    },
    [account, refresh],
  );

  /** Push a stranded balance out of the receiver. Anyone can call this. */
  const pushStranded = useCallback(
    async (sub: Subscription) => {
      if (!account || !address) throw new Error("connect a wallet first");
      setBusy(sub.symbol);
      try {
        const { transaction_hash } = await account.execute([
          {
            contractAddress: sub.handler,
            entrypoint: "dispatch",
            // Read fresh rather than trusting the balance from the last refresh.
            calldata: await dispatchCalldata(sub, await tokenBalance(config.strk.address, sub.handler)),
          },
        ]);
        await confirm(transaction_hash);
        return transaction_hash;
      } finally {
        setBusy(null);
        void refresh();
      }
    },
    [account, address, refresh],
  );

  return {
    ...state,
    busy,
    refresh,
    subscribe,
    unsubscribe,
    claimNow,
    pushStranded,
    stake,
    unstake,
    withdraw,
    escape,
    switchDelegation,
    subscriptionFor,
  };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : "could not read chain state";
}

/** u256 calldata halves. */
function u256(v: bigint): { low: string; high: string } {
  return { low: (v & ((1n << 128n) - 1n)).toString(), high: (v >> 128n).toString() };
}

async function isDeployed(address: string): Promise<boolean> {
  try {
    const cls = await provider().getClassHashAt(address);
    return Boolean(cls) && BigInt(cls) !== 0n;
  } catch {
    return false;
  }
}

/**
 * What a receiver will hold once `claim()` has run inside `claim_and_dispatch`:
 * its current STRK plus what the pool still owes. Both read fresh.
 */
async function heldAfterClaim(sub: Subscription, member: string): Promise<bigint> {
  const [held, info] = await Promise.all([
    tokenBalance(config.strk.address, sub.handler),
    readPoolMember(sub.pool, member),
  ]);
  return held + (info?.unclaimedRewards ?? 0n);
}

/**
 * `dispatch(amount: u256, min_out: u256, routes: Array<Route>)`.
 *
 * `amount = 0` means "everything held" and `min_out = 0` means "use the
 * contract's own oracle floor" — the handler ignores a caller floor that is
 * looser than its own, so passing zero is safe rather than reckless.
 *
 * @param sellAmount what the receiver will hold when `dispatch` runs, which is
 *                   what the route has to be quoted for
 */
async function dispatchCalldata(sub: Subscription, sellAmount: bigint): Promise<string[]> {
  const amount = ["0", "0"];
  const minOut = ["0", "0"];

  // Pass-through receiver: no swap, so no routes.
  if (!sub.outToken || BigInt(sub.outToken) === 0n) {
    return [...amount, ...minOut, "0"];
  }

  // Nothing to swap: `dispatch` returns before it ever looks at the route, so
  // an empty one is fine here — and only here.
  if (sellAmount === 0n) return [...amount, ...minOut, "0"];

  // The receiver is the taker: AVNU requires beneficiary == caller, and the
  // caller of the router is the receiver, not the delegator.
  const quote = await fetchQuote({
    sellToken: config.strk.address,
    buyToken: sub.outToken,
    sellAmount,
    taker: sub.handler,
  }).catch((e: unknown) => {
    // AVNU serves no route at all for very small amounts into the thinner BTC
    // tokens (about 10 STRK and up for strkBTC and SolvBTC). That is not a
    // failure worth a raw API message — the rewards simply wait until there is
    // enough to swap, which is also what the keeper does.
    if (e instanceof Error && e.message.includes("no AVNU quote")) {
      throw new Error(
        `Too little to swap to ${sub.symbol} yet — there is no route for ` +
          `${formatUnits(sellAmount, 18)} STRK. It goes out once more has accrued.`,
      );
    }
    throw e;
  });
  return [...amount, ...minOut, ...routesToCalldata(quote.routes)];
}
