"use client";

import { config, explorerClass, explorerContract } from "@/lib/config";
import { formatUnits, shortHex } from "@/lib/format";
import { totalsByToken, type HistoryEntry } from "@/lib/history";
import { POOLS } from "@/lib/config";
import type { Subscription } from "@/lib/subscriptions";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-2 py-2 text-[13px] text-ink-2 last:border-0">
      <span>{label}</span>
      <span className="mono font-medium text-ink">{children}</span>
    </div>
  );
}

const decimalsFor = (token: string) =>
  POOLS.find((p) => p.payoutToken && BigInt(p.payoutToken) === BigInt(token))?.decimals ?? 18;

const symbolFor = (token: string) =>
  POOLS.find((p) => p.payoutToken && BigInt(p.payoutToken) === BigInt(token))?.symbol ?? "STRK";

/**
 * One receiver, with what it has actually paid out.
 *
 * The totals are summed from the receiver's own `Dispatched` events, whose
 * `amount_out` is the measured balance delta at the moment of the swap — not a
 * figure the router reported and not one we computed here.
 */
export function ReceiverCard({
  subscription,
  history,
}: {
  subscription: Subscription;
  history: HistoryEntry[];
}) {
  const totals = totalsByToken(history);
  const paid = [...totals.entries()].filter(([, amount]) => amount > 0n);

  return (
    <div className="border border-line p-5">
      <div className="flex items-center gap-2.5">
        <h3 className="text-[15px] font-semibold tracking-[-0.02em]">
          {subscription.symbol} receiver
        </h3>
        <span
          className={`flex items-center gap-1.5 font-mono text-[11px] ${
            subscription.active ? "text-ink-2" : "text-ink-3"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${subscription.active ? "bg-live" : "bg-ink-3"}`}
          />
          {subscription.active ? "active" : "not the reward address"}
        </span>
      </div>

      <p className="mt-2 text-[13px] text-ink-2">
        Deployed for you alone. Its payout address is fixed and we cannot change it.
      </p>

      {paid.length > 0 ? (
        <div className="mt-4 border-t border-line pt-3">
          <div className="text-[12.5px] text-ink-3">Sent to you so far</div>
          <div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1">
            {paid.map(([token, amount]) => (
              <span key={token} className="mono text-[17px] font-medium tracking-[-0.03em]">
                {formatUnits(amount, decimalsFor(token), symbolFor(token) === "STRK" ? 2 : 6)}
                <span className="ml-1.5 text-[12px] tracking-normal text-ink-2">
                  {symbolFor(token)}
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <Row label="Address">
          <a
            href={explorerContract(subscription.handler)}
            target="_blank"
            rel="noopener noreferrer"
            className="border-b border-ink pb-px"
          >
            {shortHex(subscription.handler)}
          </a>
        </Row>
        <Row label="Pays out to">{shortHex(subscription.payout)}</Row>
        <Row label="Max slippage">1.00%</Row>
        <Row label="Price floor">Pragma median</Row>
        {subscription.held > 0n ? (
          <Row label="Holding">{formatUnits(subscription.held, 18)} STRK</Row>
        ) : null}
        {config.deployed.handlerClassHash ? (
          <Row label="Class hash">
            <a
              href={explorerClass(config.deployed.handlerClassHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="border-b border-ink pb-px"
            >
              {shortHex(config.deployed.handlerClassHash)}
            </a>
          </Row>
        ) : null}
      </div>
    </div>
  );
}
