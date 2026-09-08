"use client";

import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";
import { useStarknetkitConnectModal } from "starknetkit";
import { Marquee } from "./Marquee";
import { shortHex } from "@/lib/format";
import { LINKS } from "@/lib/config";

const NAV = [
  { label: "Auto-claim", href: "#auto-claim" },
  { label: "How it works", href: "#how-it-works" },
  { label: "About us", href: "#about" },
];

export function Header() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { starknetkitConnectModal } = useStarknetkitConnectModal({
    connectors: connectors as never,
    dappName: "Unwrap Labs Validator",
  });

  const openWallet = async () => {
    const { connector } = await starknetkitConnectModal();
    if (connector) connect({ connector: connector as never });
  };

  return (
    <header className="sticky top-0 z-30">
      <Marquee />
      <div className="border-b border-line bg-white/92 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-[1400px] items-center gap-6 px-5 md:px-10">
          <a href={LINKS.site} className="shrink-0 leading-none">
            <span className="block font-mono text-[19px] font-bold tracking-[-0.03em]">
              .unwrap()
            </span>
            <span className="mt-[1px] block font-mono text-[11px] text-ink-2">Labs</span>
          </a>

          <span className="hidden h-[22px] w-px bg-line md:block" />
          <span className="hidden font-mono text-[13px] text-ink-2 md:block">Validator</span>

          <nav className="ml-auto hidden items-center gap-7 font-mono text-[13px] text-ink-2 lg:flex">
            {NAV.map((item) => (
              <a key={item.label} href={item.href} className="transition-colors hover:text-ink">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto lg:ml-0">
            {isConnected && address ? (
              <button
                onClick={() => disconnect()}
                title="Disconnect"
                className="flex items-center gap-2.5 rounded-[4px] border border-line px-3 py-2 font-mono text-[13px] transition-colors hover:border-ink"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-live" />
                {shortHex(address)}
              </button>
            ) : (
              <button
                onClick={openWallet}
                className="rounded-[4px] bg-ink px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-neutral-800"
              >
                Connect wallet
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
