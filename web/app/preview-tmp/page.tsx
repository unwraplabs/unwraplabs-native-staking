"use client";
import { PositionCard } from "@/components/dashboard/PositionCard";
import { PositionSkeleton } from "@/components/dashboard/Skeleton";
import type { PoolPosition, Subscription } from "@/lib/subscriptions";
import type { HistoryEntry } from "@/lib/history";

const A = "0x0479ffffffffffffffffffffffffffffffffffffffffffffffffffffffffa55a";
const B = "0x005bffffffffffffffffffffffffffffffffffffffffffffffffffffffff8a2b";

const strk: PoolPosition = {
  symbol: "STRK", pool: A, token: A, decimals: 18, kind: "strk",
  staked: 10n * 10n ** 18n, unclaimed: 0n, member: true,
  icon: "/tokens/strk.png", walletBalance: 55n * 10n ** 18n,
};
const solv: PoolPosition = {
  symbol: "SolvBTC", pool: A, token: A, decimals: 18, kind: "btc",
  staked: 0n, unclaimed: 0n, member: true,
  icon: "/tokens/solvbtc.png", walletBalance: 0n,
};
const sub: Subscription = {
  handler: A, pool: A, poolMember: B, payout: B, outToken: "0x0",
  symbol: "STRK", active: true, rewardAddress: A, held: 0n,
};
const hist: HistoryEntry[] = [
  { kind: "dispatched", txHash: A, block: 14647112, claimed: 1234n * 10n ** 15n,
    token: "0x0", amount: 1234n * 10n ** 15n } as unknown as HistoryEntry,
];
const noop = () => {};
const prices = { strk: 0.029, btc: 95000 };

export default function Preview() {
  return (
    <main className="mx-auto max-w-[900px] p-10">
      <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-2">
        <PositionCard position={strk} subscription={sub} history={hist} prices={prices}
          apr={7.71} busy={false} onClaim={noop} onSubscribe={noop} onUnsubscribe={noop}
          onStake={noop} onUnstake={noop} onSwitch={noop} />
        <PositionCard position={solv} prices={prices} apr={2.54} busy={false}
          onClaim={noop} onSubscribe={noop} onUnsubscribe={noop}
          onStake={noop} onUnstake={noop} onSwitch={noop} />
      </div>
      <div className="mt-10 grid grid-cols-1 items-stretch gap-6 xl:grid-cols-2">
        <PositionSkeleton />
        <PositionSkeleton />
      </div>
    </main>
  );
}
