"use client";

/* eslint-disable @next/next/no-img-element */
import { Reveal } from "@/components/Reveal";
import { LINKS } from "@/lib/config";

const PRODUCTS = [
  {
    icon: "/products/endur.svg",
    name: "Endur",
    blurb: "Liquid staking for STRK and Bitcoin.",
    href: LINKS.endur,
    site: "app.endur.fi",
  },
  {
    icon: "/products/troves.svg",
    name: "Troves",
    blurb: "Automated yield strategies.",
    href: LINKS.troves,
    site: "app.troves.fi",
  },
];

export function AboutUs() {
  return (
    <section id="about" className="mx-auto max-w-[1400px] scroll-mt-32 px-5 py-20 md:px-10">
      <Reveal>
        <h2 className="headline text-[26px]">About us</h2>
        <p className="mt-3 max-w-[64ch] text-[15.5px] text-ink-2">
          Unwrap Labs builds foundational infrastructure on Starknet. We power two of the network&apos;s
          core DeFi primitives — Endur, its liquid staking protocol for STRK and Bitcoin, and Troves,
          its yield layer — and we run this validator on the same operational footing.
        </p>
      </Reveal>

      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
        {PRODUCTS.map((p, i) => (
          <Reveal key={p.name} delay={i * 0.08}>
            <a
              href={p.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 border border-line p-6 transition-colors hover:border-ink"
            >
              <img src={p.icon} alt="" aria-hidden width={44} height={44} className="shrink-0 rounded-full" />
              <div>
                <h3 className="text-[16px] font-semibold tracking-[-0.02em]">{p.name}</h3>
                <p className="mt-0.5 text-[13.5px] text-ink-2">{p.blurb}</p>
                <span className="mono mt-2 block text-[12px] text-ink-3">{p.site}</span>
              </div>
            </a>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
