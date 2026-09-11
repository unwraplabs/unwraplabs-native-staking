"use client";

import { useState } from "react";
import { CaretIcon } from "@/components/Icons";
import { POOLS, explorerTx } from "@/lib/config";
import { formatUnits, shortHex } from "@/lib/format";
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

/** Rows per page. Kept short so the table never pushes the page away. */
const PAGE_SIZE = 5;

const ARROW =
  "flex h-7 w-7 items-center justify-center rounded-[4px] border border-line text-ink-2 " +
  "transition-colors hover:border-ink hover:text-ink disabled:opacity-40 " +
  "disabled:hover:border-line disabled:hover:text-ink-2";

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

  // Paged in the browser: the logs are already read in full, so a page is a
  // slice, not a request. The page is clamped rather than reset, because rows
  // arrive per receiver as each log lands and the count can move under you.
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const start = current * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);

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
            {visible.map((r, i) => (
              <tr key={`${r.txHash}-${start + i}`} className="border-b border-line-2">
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
                  {r.amountIn !== undefined ? `${formatUnits(r.amountIn, 18)} STRK` : "—"}
                </td>
                <td className="mono py-2.5 pr-4 text-right font-medium">
                  {r.amountOut !== undefined
                    ? `${formatUnits(r.amountOut, decimalsFor(r.token), symbolFor(r.token) === "STRK" ? 2 : 6)} ${symbolFor(r.token)}`
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

      {pages > 1 ? (
        <nav
          aria-label="Claim history pages"
          className="mt-3 flex items-center justify-between gap-3 text-[12.5px]"
        >
          <span className="mono text-ink-3">
            {start + 1}–{start + visible.length} of {rows.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
              aria-label="Previous page"
              title="Previous page"
              className={ARROW}
            >
              <span className="inline-flex rotate-180">
                <CaretIcon />
              </span>
            </button>
            <span className="mono text-ink-3" aria-live="polite">
              {current + 1} / {pages}
            </span>
            <button
              onClick={() => setPage(current + 1)}
              disabled={current === pages - 1}
              aria-label="Next page"
              title="Next page"
              className={ARROW}
            >
              <CaretIcon />
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
