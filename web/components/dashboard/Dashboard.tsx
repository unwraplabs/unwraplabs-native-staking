"use client";

import { useEffect, useState } from "react";
import { useAccount } from "@starknet-react/core";
import { useDelegator } from "@/hooks/useDelegator";
import { fetchHoldings, type Holdings } from "@/lib/holdings";
import { fetchPrices, type Prices } from "@/lib/prices";
import { sortPositions } from "@/lib/positions";
import { sameAddress } from "@/lib/format";
import type { ValidatorStats } from "@/lib/endur";
import { History } from "./History";
import { PositionCard } from "./PositionCard";
import { ReceiverCard } from "./ReceiverCard";
import { StrandedBanner } from "./StrandedBanner";
import { SubscribeDialog } from "./SubscribeDialog";
import { SwitchDialog } from "./SwitchDialog";
import { HoldingsCard } from "./HoldingsCard";
import { PositionSkeleton, RailSkeleton } from "./Skeleton";
import { TrustStrip } from "./TrustStrip";

export function Dashboard({ stats }: { stats: ValidatorStats }) {
  const { address } = useAccount();
  const {
    positions,
    subscriptions,
    history,
    loadingPositions,
    loadingSubscriptions,
    loadingHistory,
    error,
    busy,
    subscribe,
    unsubscribe,
    claimNow,
    pushStranded,
    stake,
    unstake,
    escape,
    switchDelegation,
    subscriptionFor,
  } = useDelegator();
  const [prices, setPrices] = useState<Prices>({ strk: null, btc: null });
  const [notice, setNotice] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [wallet, setWallet] = useState<Holdings | null>(null);
  const [others, setOthers] = useState<Array<{ label: string; holdings: Holdings }>>([]);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    void fetchPrices().then(setPrices);
  }, []);

  useEffect(() => {
    if (!address) return;
    void fetchHoldings(address).then(setWallet);
  }, [address]);

  // Any address that will receive rewards but is not the wallet in front of the
  // delegator. A receiver contract is excluded — its balance is transient and
  // already reported on its own card, so listing it here would read as money
  // sitting somewhere unexpected.
  useEffect(() => {
    if (!address) return;
    const handlers = new Set(subscriptions.map((s) => BigInt(s.handler).toString()));
    const candidates = new Map<string, string>();

    for (const p of positions) {
      if (!p.member || !p.rewardAddress) continue;
      if (sameAddress(p.rewardAddress, address)) continue;
      if (handlers.has(BigInt(p.rewardAddress).toString())) continue;
      candidates.set(BigInt(p.rewardAddress).toString(), p.rewardAddress);
    }
    for (const sub of subscriptions) {
      if (sameAddress(sub.payout, address)) continue;
      candidates.set(BigInt(sub.payout).toString(), sub.payout);
    }

    if (candidates.size === 0) {
      setOthers([]);
      return;
    }
    void Promise.all(
      [...candidates.values()].map(async (addr) => ({
        label: "Rewards paid to",
        holdings: await fetchHoldings(addr),
      })),
    ).then(setOthers);
  }, [address, positions, subscriptions]);

  const guard = (fn: () => Promise<unknown>) => async () => {
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "transaction failed");
    }
  };

  // Every pool is shown so a delegator can stake into one they are not in yet,
  // ordered so their largest position leads.
  const mine = sortPositions(positions, prices);
  const held = mine.filter((p) => p.member);
  const pending = mine.find((p) => p.symbol === subscribing);
  const switchTarget = mine.find((p) => p.symbol === switching);
  const stranded = subscriptions.filter((s) => s.active && s.held > 0n);

  return (
    <div>
      <TrustStrip stats={stats} />

      <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-10 px-5 py-8 md:px-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <StrandedBanner
            stranded={stranded}
            onPush={(s) => void guard(() => pushStranded(s))()}
            onEscape={(s) => void guard(() => escape(s))()}
            busy={busy}
          />

          {notice ? (
            <div className="mb-5 border border-line bg-[#FCFCFC] p-3 text-[13px] text-ink-2">
              {notice}
            </div>
          ) : null}

          {/* Skeletons rather than a sentence: the cards are a fixed shape, so
              showing that shape immediately makes the wait feel like loading
              rather than like nothing happening. */}
          {loadingPositions && positions.length === 0 ? (
            <div className="grid grid-cols-1 gap-x-10 xl:grid-cols-2">
              <PositionSkeleton />
              <PositionSkeleton />
            </div>
          ) : null}

          {error ? (
            <p className="py-10 text-[14px] text-ink-2">
              Could not read chain state: {error}
            </p>
          ) : null}

          {!loadingPositions && held.length === 0 && !error ? (
            <div className="border-t border-line py-10">
              <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
                No delegation found for {address ? "this wallet" : "you"}
              </h2>
              <p className="mt-2 max-w-[56ch] text-[14px] text-ink-2">
                We looked in every pool we operate — STRK and each Bitcoin token — and this address
                is not a member of any of them. Stake into one below to get started, then turn on
                automated claiming.
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-x-10 xl:grid-cols-2">
          {mine.map((p) => (
            <PositionCard
              key={p.symbol}
              position={p}
              subscription={subscriptionFor(p.pool)}
              history={(() => {
                const sub = subscriptionFor(p.pool);
                return sub ? history[sub.handler] : undefined;
              })()}
              historyLoading={loadingSubscriptions || loadingHistory}
              prices={prices}
              apr={p.kind === "btc" ? stats.btcApy : stats.apy}
              busy={busy === p.symbol}
              onClaim={guard(() => claimNow(p.symbol))}
              onSubscribe={() => setSubscribing(p.symbol)}
              onUnsubscribe={guard(() => unsubscribe(p.symbol))}
              onStake={(amount) => void guard(() => stake(p.symbol, amount, p.member))()}
              onUnstake={(amount) => void guard(() => unstake(p.symbol, amount))()}
              onSwitch={() => setSwitching(p.symbol)}
            />
          ))}
          </div>

          {subscriptions.length > 0 ? (
            <History subscriptions={subscriptions} history={history} />
          ) : null}
        </div>

        <aside className="space-y-5">
          <HoldingsCard wallet={wallet} others={others} prices={prices} />

          {loadingSubscriptions && subscriptions.length === 0 ? (
            <RailSkeleton />
          ) : subscriptions.length === 0 ? (
            <div className="border border-line p-5">
              <h3 className="text-[15px] font-semibold tracking-[-0.02em]">
                Automated reward claiming
              </h3>
              <p className="mt-2 text-[13px] text-ink-2">
                Not <strong className="font-semibold text-ink">On</strong> yet. Turn it on for a
                position and your rewards are claimed weekly and sent to your address — as Bitcoin
                for a BTC pool. It cannot touch your principal, and you can turn it off yourself at
                any time.
              </p>
              <a href="#auto-claim" className="verify mt-3 inline-block">
                How it works
              </a>
            </div>
          ) : (
            subscriptions.map((s) => (
              <ReceiverCard key={s.handler} subscription={s} history={history[s.handler] ?? []} />
            ))
          )}
        </aside>
      </div>

      {switchTarget ? (
        <SwitchDialog
          position={switchTarget}
          busy={busy === switchTarget.symbol}
          onCancel={() => setSwitching(null)}
          onConfirm={(source, amount) => {
            setSwitching(null);
            void guard(() => switchDelegation(switchTarget.symbol, source, amount))();
          }}
        />
      ) : null}

      {pending && address ? (
        <SubscribeDialog
          position={pending}
          wallet={address}
          busy={busy === pending.symbol}
          onCancel={() => setSubscribing(null)}
          onConfirm={(payout) => {
            setSubscribing(null);
            void guard(() => subscribe(pending.symbol, payout))();
          }}
        />
      ) : null}
    </div>
  );
}
