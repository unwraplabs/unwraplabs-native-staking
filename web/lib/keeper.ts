/**
 * The keeper.
 *
 * Once a week it walks every handler the factory has deployed, decides which
 * are still live, and runs `claim_and_dispatch` on those with something to pay.
 *
 * ## Why there is no indexer and no database
 *
 * The factory's index is the candidate list, and the pool's `reward_address` is
 * the truth. A subscription is live if and only if the pool still pays the
 * handler. Nothing is cached, so nothing can be stale, and a delegator who opts
 * out is dropped on the very next run without telling us anything.
 *
 * ## Why one transaction per subscription
 *
 * Batching them would be cheaper. It would also mean one delegator's bad swap
 * route reverting everybody else's claim in the same multicall. With this many
 * users, isolation is worth more than the gas.
 */
import { Account, Contract, RpcProvider, type Abi } from "starknet";
import factoryAbi from "./abi/factory.json";
import handlerAbi from "./abi/handler.json";
import { fetchQuote, routesToCalldata } from "./avnu";
import { config, POOLS } from "./config";
import { normalizeAddress, sameAddress } from "./format";
import { createLogger, type Logger } from "./logger";
import { readPoolMember } from "./subscriptions";

export type KeeperResult = {
  runId: string;
  dryRun: boolean;
  scanned: number;
  active: number;
  unsubscribed: number;
  skippedEmpty: number;
  dispatched: number;
  failed: number;
  durationMs: number;
  transactions: Array<{ handler: string; symbol: string; txHash: string; strk: string }>;
  errors: Array<{ handler: string; symbol: string; error: string }>;
};

const PAGE = 200;

export async function runKeeper(opts: { dryRun?: boolean } = {}): Promise<KeeperResult> {
  const runId = `keeper-${Date.now().toString(36)}`;
  const log = createLogger(runId);
  const dryRun = opts.dryRun ?? false;

  const result: KeeperResult = {
    runId,
    dryRun,
    scanned: 0,
    active: 0,
    unsubscribed: 0,
    skippedEmpty: 0,
    dispatched: 0,
    failed: 0,
    durationMs: 0,
    transactions: [],
    errors: [],
  };

  if (!config.deployed.factory) {
    log.error("no factory address configured; nothing to do");
    result.durationMs = log.elapsed();
    return result;
  }

  const provider = new RpcProvider({ nodeUrl: process.env.RPC_URL || config.rpc });
  const account = dryRun ? null : keeperAccount(provider, log);
  if (!dryRun && !account) {
    log.error("keeper credentials missing; refusing to run", {
      hint: "set KEEPER_ADDRESS and KEEPER_PRIVATE_KEY",
    });
    result.durationMs = log.elapsed();
    return result;
  }

  const factory = new Contract({
    abi: factoryAbi as Abi,
    address: config.deployed.factory,
    providerOrAccount: provider,
  });

  log.info("run started", { dryRun, factory: config.deployed.factory });

  const subscriptions = await readAllSubscriptions(factory, log);
  result.scanned = subscriptions.length;
  log.info("subscriptions read from factory index", { count: subscriptions.length });

  for (const sub of subscriptions) {
    const symbol = POOLS.find((p) => sameAddress(p.pool, sub.pool))?.symbol ?? "unknown";
    const ctx = { handler: sub.handler, symbol, member: sub.poolMember };

    try {
      // The truth check. Everything else is bookkeeping.
      const info = await poolMemberInfo(provider, sub.pool, sub.poolMember);
      if (!info) {
        result.unsubscribed++;
        log.info("skipped: no longer a pool member", ctx);
        continue;
      }
      if (!sameAddress(info.rewardAddress, sub.handler)) {
        result.unsubscribed++;
        log.info("skipped: unsubscribed", {
          ...ctx,
          rewardAddress: info.rewardAddress,
        });
        continue;
      }
      result.active++;

      const held = await handlerHeld(provider, sub.handler);
      // What the receiver will hold once the claim lands: what is already
      // stranded there plus what the pool still owes.
      const total = held + info.unclaimed;

      if (total === 0n) {
        result.skippedEmpty++;
        log.info("skipped: nothing to claim or dispatch", ctx);
        continue;
      }

      log.info("dispatching", {
        ...ctx,
        unclaimed: info.unclaimed.toString(),
        held: held.toString(),
        total: total.toString(),
      });

      const routes = await buildRoutes(sub, total, log, ctx);

      if (dryRun) {
        result.dispatched++;
        log.info("dry run: would call claim_and_dispatch", { ...ctx, routes: routes.length });
        continue;
      }

      const { transaction_hash } = await account!.execute([
        {
          contractAddress: sub.handler,
          entrypoint: "claim_and_dispatch",
          // amount 0 = everything held; min_out 0 = use the contract's own
          // oracle floor, which it enforces regardless of what we pass.
          calldata: ["0", "0", "0", "0", ...routesToCalldata(routes)],
        },
      ]);
      await provider.waitForTransaction(transaction_hash);

      result.dispatched++;
      result.transactions.push({
        handler: sub.handler,
        symbol,
        txHash: transaction_hash,
        strk: total.toString(),
      });
      log.info("dispatched", { ...ctx, txHash: transaction_hash });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      result.failed++;
      result.errors.push({ handler: sub.handler, symbol, error });
      // One failure must not end the run: the next delegator is unrelated.
      log.error("dispatch failed", { ...ctx, error });
    }
  }

  result.durationMs = log.elapsed();
  log.info("run finished", {
    scanned: result.scanned,
    active: result.active,
    unsubscribed: result.unsubscribed,
    skippedEmpty: result.skippedEmpty,
    dispatched: result.dispatched,
    failed: result.failed,
    durationMs: result.durationMs,
  });
  return result;
}

type IndexedSubscription = {
  handler: string;
  pool: string;
  poolMember: string;
  payout: string;
  outToken: string;
};

async function readAllSubscriptions(
  factory: Contract,
  log: Logger,
): Promise<IndexedSubscription[]> {
  const total = Number(BigInt((await factory.call("subscriptions_count", [])) as never));
  const out: IndexedSubscription[] = [];

  for (let start = 0; start < total; start += PAGE) {
    const page = (await factory.call("subscriptions", [start, PAGE])) as any[];
    for (const s of page) {
      out.push({
        handler: normalizeAddress(s.handler),
        pool: normalizeAddress(s.pool),
        poolMember: normalizeAddress(s.pool_member),
        payout: normalizeAddress(s.payout),
        outToken: normalizeAddress(s.out_token),
      });
    }
    log.info("read page", { start, got: page.length, total });
  }
  return out;
}

/**
 * The truth check, via the same felt decoder the app uses.
 *
 * This deliberately does not go through an ABI: `Option<PoolMemberInfoV1>`
 * cannot be described by the partial ABI we have, and a misread here would make
 * the keeper skip a live subscription or act on a dead one.
 */
async function poolMemberInfo(
  _provider: RpcProvider,
  pool: string,
  member: string,
): Promise<{ rewardAddress: string; unclaimed: bigint } | null> {
  const info = await readPoolMember(pool, member);
  if (!info) return null;
  return { rewardAddress: info.rewardAddress, unclaimed: info.unclaimedRewards };
}

async function handlerHeld(provider: RpcProvider, handler: string): Promise<bigint> {
  try {
    const contract = new Contract({
      abi: handlerAbi as Abi,
      address: handler,
      providerOrAccount: provider,
    });
    const held: any = await contract.call("held", []);
    return BigInt(held?.toString?.() ?? held ?? 0);
  } catch {
    return 0n;
  }
}

/** Pass-through receivers need no route; swapping ones get a fresh AVNU quote. */
async function buildRoutes(
  sub: IndexedSubscription,
  amount: bigint,
  log: Logger,
  ctx: Record<string, string>,
) {
  if (!sub.outToken || BigInt(sub.outToken) === 0n) return [];

  const quote = await fetchQuote({
    sellToken: config.strk.address,
    buyToken: sub.outToken,
    sellAmount: amount,
    // The receiver is the taker: AVNU requires beneficiary == caller, and the
    // caller here is the receiver, not us.
    taker: sub.handler,
  });
  log.info("quoted", {
    ...ctx,
    sell: quote.sellAmount.toString(),
    buy: quote.buyAmount.toString(),
    hops: quote.routes.length,
  });
  return quote.routes;
}

function keeperAccount(provider: RpcProvider, log: Logger): Account | null {
  const address = process.env.KEEPER_ADDRESS;
  const key = process.env.KEEPER_PRIVATE_KEY;
  if (!address || !key) return null;
  log.info("keeper account loaded", { address: normalizeAddress(address) });
  return new Account({ provider, address, signer: key });
}
