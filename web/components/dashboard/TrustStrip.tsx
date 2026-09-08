"use client";

import { LINKS } from "@/lib/config";
import { compact, num } from "@/lib/format";
import type { ValidatorStats } from "@/lib/endur";

/** Keeps the validator's record in view while the delegator is acting on it. */
export function TrustStrip({ stats }: { stats: ValidatorStats }) {
  const items = [
    { label: "BTC rank", value: `#${stats.btcRank}` },
    { label: "Delegated", value: `${compact(stats.strkStaked, 1)} STRK` },
    { label: "Bitcoin", value: `${num(stats.btcStaked, 1)} BTC` },
    { label: "Commission", value: `${num(stats.commission, 0)}%` },
    { label: "Liveliness", value: `${num(stats.liveliness, 2)}%` },
  ];

  return (
    <div className="border-b border-line bg-[#FCFCFC]">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-7 gap-y-2 px-5 py-3 text-[12.5px] text-ink-2 md:px-10">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-live" />
          {stats.live ? "Live" : "Cached"}
        </span>
        {items.map((i) => (
          <span key={i.label}>
            {i.label} <b className="mono font-medium text-ink">{i.value}</b>
          </span>
        ))}
        <span className="flex-1" />
        <a
          href={LINKS.validatorRecord}
          target="_blank"
          rel="noopener noreferrer"
          className="verify"
        >
          Check the full record
        </a>
      </div>
    </div>
  );
}
