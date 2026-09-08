"use client";

import { POOLS, explorerTx } from "@/lib/config";
import { fromUnits, num, shortHex } from "@/lib/format";
import type { HistoryEntry } from "@/lib/history";
import type { Subscription } from "@/lib/subscriptions";

const symbolFor = (token?: string) => {
  if (!token) return "STRK";
  const hit = POOLS.find((p) => p.payoutToken && BigInt(p.payoutToken) === BigInt(token));
  return hit?.symbol ?? "STRK";
};
const decimalsFor = (token?: string) => {
  if (!token) return 18;
  const hit = POOLS.find((p) => p.payoutToken && BigInt(p.payoutToken) === BigInt(token));
  return hit?.decimals ?? 18;
};

/**
 * Claim history, straight from the receivers' event logs. Every row links to
 * the transaction, so nothing here has to be taken on our word.
 */
export function History({
  subscriptions,
  history,
}: {
  subscriptions: Subscription[];
  history: Record<string, HistoryEntry[]>;
}) {
  const rows = subscriptions
    .flatMap((s) =>
      (history[s.handler] ?? []).map((e) => ({ ...e, symbol: s.symbol, handler: s.handler })),
    )
    .sort((a, b) => b.blockNumber - a.blockNumber);

  if (rows.length === 0) {
    return (
      <div className="border-t border-line py-6">
        <h3 className="text-[15px] font-semibold tracking-[-0.02em]">Claim history</h3>
        <p className="mt-2 text-[13.5px] text-ink-2">
          Nothing yet. Once a receiver runs, every claim and payout appears here, read from its own
          events.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-line py-6">
      <h3 className="text-[15px] font-semibold tracking-[-0.02em]">Claim history</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[540px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-ink-3">
              <th className="py-2 pr-4 font-normal">Block</th>
              <th className="py-2 pr-4 font-normal">Pool</th>
              <th className="py-2 pr-4 font-normal">Event</th>
              <th className="py-2 pr-4 text-right font-normal">In</th>
              <th className="py-2 pr-4 text-right font-normal">Sent to you</th>
              <th className="py-2 text-right font-normal">Tx</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.txHash}-${i}`} className="border-b border-line-2">
                <td className="mono py-2.5 pr-4 text-ink-2">{r.blockNumber || "—"}</td>
                <td className="py-2.5 pr-4">{r.symbol}</td>
                <td className="py-2.5 pr-4 text-ink-2">
                  {r.kind === "claimed"
                    ? "Claimed from pool"
                    : r.kind === "dispatched"
                      ? "Paid out"
                      : "Swept"}
                </td>
                <td className="mono py-2.5 pr-4 text-right">
                  {r.amountIn !== undefined ? `${num(fromUnits(r.amountIn, 18), 2)} STRK` : "—"}
                </td>
                <td className="mono py-2.5 pr-4 text-right font-medium">
                  {r.amountOut !== undefined
                    ? `${num(fromUnits(r.amountOut, decimalsFor(r.token)), symbolFor(r.token) === "STRK" ? 2 : 6)} ${symbolFor(r.token)}`
                    : "—"}
                </td>
                <td className="py-2.5 text-right">
                  <a
                    href={explorerTx(r.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="verify"
                  >
                    {shortHex(r.txHash, 6, 4)}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
