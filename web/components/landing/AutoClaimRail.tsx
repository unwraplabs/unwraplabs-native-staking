"use client";

import { Reveal } from "@/components/Reveal";
import { config, explorerClass } from "@/lib/config";
import { shortHex } from "@/lib/format";

/**
 * The right rail. Reserved entirely for automated reward claiming — it is the
 * one thing here nobody else offers, so it gets the one persistent slot.
 *
 * Note the copy discipline: "free" appears as a property in the list, not as
 * the headline. Leading with the price makes it sound like the product is a
 * discount. The product is that the rewards arrive without you doing anything,
 * and that the contract doing it cannot take anything.
 */
const POINTS = [
  {
    lead: "It cannot touch your principal.",
    body: "The pool only accepts exit calls from you, and this contract is not you. Claiming and forwarding is its entire surface.",
  },
  {
    lead: "No owner, no upgrade, no admin key.",
    body: "Every setting, including where it pays out, is fixed when your receiver is deployed. We cannot change it, redirect it, or pause it.",
  },
  {
    lead: "If we vanish, it keeps working.",
    body: "The claim is permissionless — you, or anyone, can trigger it. Swaps are floored by a Pragma median with a 1% slippage cap.",
  },
];

export function AutoClaimRail({
  onActivate,
  ctaLabel,
}: {
  onActivate: () => void;
  ctaLabel: string;
}) {
  return (
    <aside className="lg:border-l lg:border-line lg:pl-10">
      <Reveal onMount>
        <h2 className="headline text-[clamp(22px,2vw,27px)]">Automated reward claiming</h2>
        <div className="mt-4 h-px bg-line" />
      </Reveal>

      <Reveal delay={0.06} onMount>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
          Opt in once and your rewards are claimed every week and sent to your address —
          <span className="font-medium text-ink"> as Bitcoin, if that is what you staked</span>. This
          is native Starknet staking: you delegate directly to the validator and keep your position,
          with no wrapper token and nothing minted against it.
        </p>
      </Reveal>

      <Reveal delay={0.12} onMount>
        <ul className="mt-6 space-y-4">
          {POINTS.map((p) => (
            <li key={p.lead} className="border-l-2 border-line pl-4">
              <p className="text-[14.5px] font-semibold tracking-[-0.02em]">{p.lead}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{p.body}</p>
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal delay={0.18} onMount>
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[12px] text-ink-3">
          <span>Free to use, for every delegator</span>
          <span>·</span>
          <span>We pay the claim gas</span>
          <span>·</span>
          <span>Weekly, from $100k staked</span>
        </div>
      </Reveal>

      <Reveal delay={0.24} onMount>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={onActivate}
            className="rounded-[4px] bg-ink px-5 py-3 text-[15px] font-semibold tracking-[-0.01em] text-white transition-colors hover:bg-neutral-800"
          >
            {ctaLabel}
          </button>
          <a
            href="#auto-claim"
            className="rounded-[4px] border border-line px-5 py-3 text-[14px] transition-colors hover:border-ink"
          >
            Learn more
          </a>
        </div>
        <p className="mt-3 text-[13px] text-ink-2">
          One transaction from your wallet. Reversible by you at any time, without asking us.
        </p>
      </Reveal>

      <Reveal delay={0.3} onMount>
        <div className="mt-6 flex items-center justify-between gap-4 border-t border-line pt-4">
          <span className="mono text-[12px] text-ink-3">
            {config.deployed.handlerClassHash
              ? `class hash ${shortHex(config.deployed.handlerClassHash)}`
              : "class hash published at deploy"}
          </span>
          {config.deployed.handlerClassHash ? (
            <a
              href={explorerClass(config.deployed.handlerClassHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="border-b border-ink pb-px text-[13px] font-medium"
            >
              Voyager
            </a>
          ) : null}
        </div>
      </Reveal>
    </aside>
  );
}
