"use client";

import { Reveal } from "@/components/Reveal";
import { compact, num, monthYear, usd } from "@/lib/format";
import { LINKS, VALIDATOR, explorerContract } from "@/lib/config";
import type { ValidatorStats } from "@/lib/endur";
import type { Prices } from "@/lib/prices";

/**
 * The claims block: figure / what it means / somewhere to check it.
 *
 * The verify link on every row is the organising idea of this page, not
 * decoration. A number without one does not belong here.
 */
function Claim({
  figure,
  unit,
  meaning,
  verify,
  href,
  delay,
  onMount,
}: {
  figure: string;
  unit?: string;
  meaning: string;
  verify: string;
  href: string;
  delay: number;
  onMount?: boolean;
}) {
  return (
    <Reveal delay={delay} onMount={onMount}>
      <div className="grid grid-cols-1 items-baseline gap-y-1.5 border-b border-line-2 py-5 md:grid-cols-[210px_1fr_auto] md:gap-x-6">
        <div className="mono text-[27px] font-medium tracking-[-0.05em]">
          {figure}
          {unit ? (
            <span className="ml-1.5 text-[13px] font-normal tracking-normal text-ink-2">
              {unit}
            </span>
          ) : null}
        </div>
        <p className="text-[15px] text-ink-2">{meaning}</p>
        <a href={href} target="_blank" rel="noopener noreferrer" className="verify justify-self-start md:justify-self-end">
          {verify}
        </a>
      </div>
    </Reveal>
  );
}

export function Claims({ stats, prices }: { stats: ValidatorStats; prices: Prices }) {
  // Money figures appear only when the price feed answered. A dash where a
  // dollar value should be is better than a stale or invented one.
  const btcUsd = prices.btc === null ? null : stats.btcStaked * prices.btc;
  const strkUsd = prices.strk === null ? null : stats.strkStaked * prices.strk;

  return (
    <div className="mt-10 border-t border-line">
      <Claim
        delay={0}
        onMount
        figure={`${num(stats.liveliness, 2)}%`}
        unit="uptime"
        meaning={`Attestation record since we started validating in ${monthYear(stats.activeSince)}.`}
        verify="Validator record"
        href={LINKS.validatorRecord}
      />
      <Claim
        delay={0.07}
        onMount
        figure={num(stats.btcStaked, 1)}
        unit="BTC"
        meaning={`Bitcoin delegated across our pools by ${stats.btcDelegators} addresses.${
          btcUsd === null ? "" : ` Worth ${usd(btcUsd)}.`
        }`}
        verify="BTC pool contract"
        href={explorerContract(
          "0x05b68011897efef3d2ac65159b500753968305f2c46f7737f895131890c5d1d9",
        )}
      />
      <Claim
        delay={0.14}
        onMount
        figure={compact(stats.strkStaked, 1)}
        unit="STRK"
        meaning={`Delegated to our STRK pool by ${stats.delegators} addresses.${
          strkUsd === null ? "" : ` Worth ${usd(strkUsd)}.`
        }`}
        verify="STRK pool contract"
        href={explorerContract(VALIDATOR.strkPool)}
      />
      <Claim
        delay={0.21}
        figure={`${num(stats.commission, 0)}%`}
        unit="commission"
        meaning="Set on chain, with a matching maximum, so it cannot be raised on you without notice."
        verify="Validator record"
        href={LINKS.validatorRecord}
      />

      <Reveal delay={0.35}>
        <p className="flex flex-wrap items-center gap-2 pt-5 text-[14px] text-ink-2">
          Every figure here is read live and recomputed on load.
          <a
            href={LINKS.validatorRecord}
            target="_blank"
            rel="noopener noreferrer"
            className="border-b border-ink pb-px font-medium text-ink"
          >
            Check the full validator record
          </a>
          <span className="mono text-[12px] text-ink-3">
            {stats.live ? "live from the Endur staking API" : "last known values — live fetch failed"}
          </span>
        </p>
      </Reveal>
    </div>
  );
}
