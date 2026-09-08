"use client";

import { config, LINKS, explorerClass, explorerContract } from "@/lib/config";

/**
 * Hand the contract to an AI and ask it to find the hole.
 *
 * The premise of this page is that you should not have to trust us. Reading
 * Cairo is a real barrier to that, so this builds a prompt pointing at the
 * public source and the deployed class on Voyager, and asks specifically for
 * the ways we *could* take your money — framed so a model that agrees with us
 * has to say why, and one that disagrees says so plainly.
 */
/**
 * Upstream code the receiver depends on.
 *
 * Without these an AI has to guess at what the staking pool, the router and the
 * oracle actually do — and a model guessing about a contract it has not read
 * reliably invents a worst case. That is not scepticism, it is noise, and it
 * scares people away from something it never checked. Naming the sources, and
 * pinning the staking repo to the commit our interfaces were transcribed from,
 * turns "this could be dangerous" into a claim it has to substantiate.
 */
const STAKING_COMMIT = "5c11a5689f2d2e08ffecebf30d3e49569accbfca";

function auditPrompt(): string {
  const lines = [
    "I am considering delegating STRK or Bitcoin to a Starknet validator that offers automated reward claiming. Audit their contracts and explain the real risks in plain English. I am not a Cairo developer.",
    "",
    "## The code to audit",
    `Their repo: ${LINKS.repo}`,
    "Contracts: contracts/src/handler.cairo (the per-user rewards receiver) and contracts/src/factory.cairo (which deploys them).",
  ];

  if (config.deployed.handlerClassHash) {
    lines.push(`Deployed receiver class: ${explorerClass(config.deployed.handlerClassHash)}`);
  }
  if (config.deployed.factory) {
    lines.push(`Deployed factory: ${explorerContract(config.deployed.factory)}`);
  }

  lines.push(
    "",
    "## Upstream code it depends on — please actually read these before judging",
    `1. Starknet staking pool, at the commit their interfaces came from: https://github.com/starkware-libs/starknet-staking/tree/${STAKING_COMMIT} (src/pool/pool.cairo, src/pool/interface.cairo). Confirm who may call claim_rewards, change_reward_address and the exit functions.`,
    "2. AVNU, the DEX router: https://github.com/orgs/avnu-labs/repositories (avnu-contracts-v2, src/exchange.cairo).",
    "3. Pragma, the oracle: https://docs.pragma.build — get_data_median, num_sources_aggregated, last_updated_timestamp.",
    "",
    "Context, so you can size upstream risk rather than assume it: Starknet staking is built and run by StarkWare; AVNU is the most used DEX aggregator on Starknet; Pragma is a primary oracle provider there. That makes none of them infallible and should not soften your findings — it is only for weighting a hypothetical failure against how this is actually deployed.",
    "",
    "Scope: mainly whether the Unwrap Labs automation contracts can be trusted, not whether Starknet, AVNU or Pragma might fail. Where upstream failure matters, tell me what their contracts do in response.",
    "",
    "Two things to check rather than assume, since they decide whether upstream failure can cost me money:",
    "- AVNU pays proceeds only to the beneficiary passed in, and asserts beneficiary == caller. So the receiver passes itself, then forwards to the immutable payout. Confirm proceeds cannot reach a third party.",
    "- Either failure alone is a no-op, not a loss. Stale, thin or absent Pragma price: the receiver reverts, rewards stay put. Pragma healthy but liquidity poor: the swap misses the floor and reverts. Losing money would need the oracle actively wrong in the right direction AND poor liquidity at the same moment. Check that this holds in the code.",
    "",
    "Base conclusions on what the upstream contracts actually do, not what a contract of that name might do. If you cannot verify something, say so rather than assuming the worst case — an unverified guess presented as a risk is worse than no answer.",
    "",
    "## The claims to check",
    "They say the receiver contract:",
    "1. cannot touch, unstake or withdraw my staked principal;",
    "2. can only ever send funds to the payout address fixed at deployment, so it cannot pay the operator or anyone else;",
    "3. has no owner, no admin key, no upgrade path and no pause;",
    "4. can only be installed or removed by me, via the staking pool's reward_address;",
    "5. is safe to leave permissionless because a Pragma oracle floor with a 1% slippage cap is enforced on every swap, and the amount received is verified against a measured balance delta rather than the router's return value;",
    "6. has one restricted entrypoint, escape(), callable only by me, which returns the rewards as STRK without swapping.",
    "",
    "## What I want from you",
    "Check each claim against the code.",
    "Then look for what they have not claimed: any path where the operator or an arbitrary caller extracts value; anything that could redirect the payout; a way to bypass the oracle floor; griefing that costs money rather than just delaying me; and what breaks if the staking pool is upgraded.",
    "",
    "## How to answer",
    "Return ONLY a short plain-English summary — a verdict on whether these contracts are safe to opt into, the worst thing that can realistically happen to my funds, and whether that is 'I could lose money' or 'I could be inconvenienced'. A few sentences.",
    "Do NOT give me a claim-by-claim or issue-by-issue breakdown unless I ask for one in a follow-up. Do the full analysis internally and tell me the conclusion. If something is genuinely serious, lead with that instead.",
  );

  return lines.join("\n");
}

function ClaudeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4.7 15.5 9.4 13l.1-.2-.1-.2H9l-.8-.1H5.6l-2.3-.1-2-.1L.7 12l.1-.7 1.6-1.1.2.1 1.9.1 2.7.2 2 .1 2.9.3h.5v-.4l-.2-.1-.1-.1L9.9 8.8 7.6 7.3 6.4 6.4l-.6-.4-.3-.4-.2-1L6 3.9l.2.1.5.4 1.2.9 1.5 1.1 2.2 1.6.3.2.2-.1v-.1l-.2-.3-1.4-2.5L8 2.6l-.6-1-.2-.6c0-.2-.1-.4-.1-.6l.8-1L8.3 0 9 .1l.3.3.5 1 .7 1.6L11.7 6l.3.7.2.4v-.2l.1-1.3.2-1.6.2-2 .1-.6.3-.7.6-.4.5.2.4.6-.1.4-.2 1.5-.5 2.7-.3 1.8h.2l.2-.2.8-1.1L16 4.3l.6-.7.4-.3h.7l.5.8-.2.8-.7.9-.6.8-.9 1.1-.5 1 .1.1h.2l3-.6 1.6-.3 1.9-.3.9.4.1.4-.4.9-2.1.5-2.5.5-3.7.9h-.1l.1.1 1.7.1h3.4l1.4.1.9.6.5.7-.1.5-1.3.7-1.8-.4-4.2-1-1.4-.4h-.2v.1l1.2 1.2 2.2 2 2.7 2.5.1.6-.3.5-.4-.1-2.3-1.7-.9-.8-2-1.7h-.1v.2l.5.7 2.5 3.7.1 1.1-.2.4-.6.2-.7-.1-1.4-1.9-1.4-2.2-1.2-2h-.2l-.6 6.3-.3.3-.7.3-.5-.4-.3-.7.3-1.3.3-1.6.3-1.3.2-1.6.2-.5v-.1h-.1l-1.1 1.6-1.8 2.4-1.4 1.5-.3.1-.6-.3.1-.5.3-.5 1.9-2.5 1.2-1.5.7-.9v-.2H8l-5.2 3.4-.9.1-.4-.4v-.5l.2-.2 1.6-1.1Z" />
    </svg>
  );
}

function OpenAIIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22.3 10a5.9 5.9 0 0 0-.5-4.9 6 6 0 0 0-6.5-2.9A6 6 0 0 0 10.8 0 6 6 0 0 0 5 4.2a5.9 5.9 0 0 0-4 2.9 6 6 0 0 0 .8 7A5.9 5.9 0 0 0 2.2 19a6 6 0 0 0 6.5 2.9A6 6 0 0 0 13.2 24a6 6 0 0 0 5.8-4.2 5.9 5.9 0 0 0 4-2.9 6 6 0 0 0-.7-7ZM13.2 22.4a4.5 4.5 0 0 1-2.9-1l.1-.1 4.8-2.8a.8.8 0 0 0 .4-.7v-6.8l2 1.2v5.6a4.5 4.5 0 0 1-4.4 4.6ZM3.6 18.3a4.4 4.4 0 0 1-.5-3l.1.1 4.8 2.8a.8.8 0 0 0 .8 0l5.9-3.4v2.3l-5 2.9a4.5 4.5 0 0 1-6.1-1.7ZM2.3 7.9A4.5 4.5 0 0 1 4.7 6v5.7a.8.8 0 0 0 .4.7l5.8 3.4-2 1.1-4.9-2.8a4.5 4.5 0 0 1-1.7-6.2Zm16.6 3.9-5.9-3.5 2-1.1 4.9 2.8a4.5 4.5 0 0 1-.7 8.1V12.5a.8.8 0 0 0-.3-.7Zm2-3-.1-.1-4.8-2.8a.8.8 0 0 0-.8 0L9.3 9.3V7l4.9-2.8a4.5 4.5 0 0 1 6.7 4.7ZM8.2 12.9l-2-1.2V6.1a4.5 4.5 0 0 1 7.4-3.5l-.1.1-4.8 2.8a.8.8 0 0 0-.4.7Zm1.1-2.4 2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5Z" />
    </svg>
  );
}

/**
 * Brand-coloured on purpose, and the only place on the page that breaks the
 * two-accent palette.
 *
 * These are the "do not trust us, go check" affordance, so they have to be
 * findable at a glance in a section that is otherwise black and white. Using
 * each product's own colour also makes it obvious you are being handed off to
 * something external rather than to another page of our marketing.
 */
const BRAND = {
  claude: { bg: "#D97757", hover: "#C4664A" },
  chatgpt: { bg: "#10A37F", hover: "#0D8A6C" },
} as const;

export function AuditButtons({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const prompt = auditPrompt();
  const claude = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
  const gpt = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;

  const base =
    "flex items-center gap-2.5 rounded-[4px] px-4 py-2.5 text-[13.5px] font-medium text-white transition-colors";

  return (
    <div className={`flex flex-wrap items-center gap-3 ${tone === "light" ? "" : ""}`}>
      <a
        href={claude}
        target="_blank"
        rel="noopener noreferrer"
        className={base}
        style={{ backgroundColor: BRAND.claude.bg }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BRAND.claude.hover)}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BRAND.claude.bg)}
      >
        <ClaudeIcon />
        Audit with Claude
      </a>
      <a
        href={gpt}
        target="_blank"
        rel="noopener noreferrer"
        className={base}
        style={{ backgroundColor: BRAND.chatgpt.bg }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BRAND.chatgpt.hover)}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BRAND.chatgpt.bg)}
      >
        <OpenAIIcon />
        Audit with ChatGPT
      </a>
    </div>
  );
}
