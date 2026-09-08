"use client";

import { Reveal } from "@/components/Reveal";
import { Claims } from "./Claims";
import type { ValidatorStats } from "@/lib/endur";
import type { Prices } from "@/lib/prices";

export function Hero({ stats, prices }: { stats: ValidatorStats; prices: Prices }) {
  return (
    <div>
      <Reveal onMount>
        {/*
          "Top 3" is the Bitcoin ranking, and the headline says so. By total
          stake we are #7, and calling ourselves top 3 without the qualifier
          would be the one false claim on a page whose whole argument is that
          you can check everything.
        */}
        <h1 className="headline max-w-[16ch] text-[clamp(34px,4.6vw,58px)]">
          Top {stats.btcRank} Bitcoin validator on Starknet.
        </h1>
      </Reveal>

      <Reveal delay={0.08} onMount>
        <p className="mt-6 max-w-[58ch] text-[17px] leading-relaxed text-ink-2">
          Unwrap Labs builds foundational infrastructure on Starknet —{" "}
          <span className="font-medium text-ink">Endur</span>, its liquid staking protocol for STRK
          and Bitcoin, and <span className="font-medium text-ink">Troves</span>, its yield layer. We
          run this validator too. Staking here is fully native: you delegate directly, keep your
          position, and every number below links to somewhere you can check it.
        </p>
      </Reveal>

      <Claims stats={stats} prices={prices} />
    </div>
  );
}
