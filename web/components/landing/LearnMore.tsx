"use client";

import { Reveal, RevealGroup } from "@/components/Reveal";
import { AuditButtons } from "@/components/AuditButtons";
import { config, explorerClass, explorerContract } from "@/lib/config";

const FLOW = [
  { title: "Rewards accrue", body: "In the delegation pool, always denominated in STRK." },
  { title: "Your receiver claims", body: "Once a week. We pay the gas." },
  { title: "Swapped to BTC", body: "Only for BTC pools. Oracle-floored, 1% slippage cap." },
  { title: "Sent to you", body: "Straight to the address you fixed at setup." },
];

const STEPS = [
  {
    n: "01",
    title: "Your address is derived",
    body: "The receiver's address is computed from a published class hash before anything exists on chain. You can rederive it yourself and confirm it matches.",
  },
  {
    n: "02",
    title: "You point rewards at it",
    body: "One call to the staking pool, from your wallet. It is the only signature in the whole flow, and the pool permits nobody but you to make it.",
  },
  {
    n: "03",
    title: "The receiver is deployed",
    body: "By us, or by anyone, at any time after. Its configuration is fixed at that moment and can never be edited by anybody, us included.",
  },
  {
    n: "04",
    title: "It runs each week",
    body: "Claim, swap if it is a BTC position, send. It runs weekly. If you ever claim manually, the funds land in your receiver and go out on the next run.",
  },
];

export function LearnMore() {
  return (
    <section id="auto-claim" className="mt-24 bg-ink py-20 text-white">
      <div className="mx-auto max-w-[1400px] px-5 md:px-10">
        <Reveal>
          <p className="font-mono text-[13px] text-neutral-500">Automated reward claiming</p>
          <h2 className="headline mt-3 max-w-[20ch] text-[clamp(28px,3.6vw,44px)]">
            Your rewards arrive on their own. As Bitcoin, if that is what you staked.
          </h2>
          <p className="mt-5 max-w-[62ch] text-[17px] text-neutral-400">
            Every other validator leaves you to remember a claim button. Opt in once and a contract
            deployed for you alone does it every week —{" "}
            <span className="font-medium text-white">claims, swaps, and sends to your address</span>{" "}
            — without you signing anything again.
          </p>
        </Reveal>

        {/* Deliberately not four identical cards: this is a sequence, so it
            reads as one rule-separated row on desktop. */}
        <Reveal delay={0.1}>
          <ol className="mt-12 grid grid-cols-1 border-t border-neutral-800 sm:grid-cols-2 lg:grid-cols-4">
            {FLOW.map((f, i) => (
              <li
                key={f.title}
                className="border-b border-neutral-800 py-5 pr-6 lg:border-b-0 lg:border-r lg:last:border-r-0 lg:pl-6 lg:first:pl-0"
              >
                <span className="mono text-[12px] text-neutral-600">{`0${i + 1}`}</span>
                <p className="mt-2 text-[15.5px] font-semibold tracking-[-0.02em]">{f.title}</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-neutral-400">{f.body}</p>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal delay={0.16}>
          <div className="mt-12 border border-neutral-800 p-6">
            <h3 className="text-[17px] font-semibold tracking-[-0.02em]">
              Do not take our word for any of this
            </h3>
            <p className="mt-2 max-w-[68ch] text-[14px] leading-relaxed text-neutral-400">
              Reading Cairo is a real barrier to checking a claim like &ldquo;it cannot touch your
              principal&rdquo;. So hand the contracts to an AI instead. These open a chat prefilled
              with links to the public source and the deployed class on Voyager, and a prompt that
              asks it to find the ways we could take your money — not to agree with us.
            </p>
            <div className="mt-5">
              <AuditButtons tone="dark" />
            </div>
          </div>
        </Reveal>

        <div id="how-it-works" className="mt-20 scroll-mt-32">
          <Reveal>
            <h3 className="headline text-[26px]">What actually happens when you turn it on</h3>
            <p className="mt-3 max-w-[60ch] text-[15.5px] text-neutral-400">
              Four steps, one of which is yours. You can walk away after step two and the rest still
              works.
            </p>
          </Reveal>

          <RevealGroup className="mt-8 grid grid-cols-1 gap-px bg-neutral-800 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="bg-ink p-6">
                <span className="mono text-[12px] text-neutral-600">{s.n}</span>
                <h4 className="mt-2 text-[15.5px] font-semibold tracking-[-0.02em]">{s.title}</h4>
                <p className="mt-2 text-[13.5px] leading-relaxed text-neutral-400">{s.body}</p>
              </div>
            ))}
          </RevealGroup>
        </div>

        <Reveal delay={0.1}>
          <div className="mt-12 border-t border-neutral-800 pt-8">
            <h3 className="text-[17px] font-semibold tracking-[-0.02em]">
              A manual claim is not a stuck state
            </h3>
            <p className="mt-2 max-w-[70ch] text-[14.5px] leading-relaxed text-neutral-400">
              If you claim from the pool yourself while auto-claim is on, the pool sends the rewards
              to your receiver with no call attached, and they sit there. That is recoverable by
              design and by anyone: the next scheduled run sweeps the balance, and you do not have
              to wait for it — the dashboard gives you a button that pushes it out immediately. The
              funds are only ever payable to your address regardless of who calls.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-[12.5px]">
              {config.deployed.handlerClassHash ? (
                <a
                  href={explorerClass(config.deployed.handlerClassHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-b border-neutral-700 pb-0.5 text-white transition-colors hover:border-white"
                >
                  Read the receiver contract on Voyager
                </a>
              ) : null}
              {config.deployed.factory ? (
                <a
                  href={explorerContract(config.deployed.factory)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-b border-neutral-700 pb-0.5 text-white transition-colors hover:border-white"
                >
                  Factory contract
                </a>
              ) : null}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
