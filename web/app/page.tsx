"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect } from "@starknet-react/core";
import { useStarknetkitConnectModal } from "starknetkit";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { AtSize } from "@/components/landing/AtSize";
import { AutoClaimRail } from "@/components/landing/AutoClaimRail";
import { Hero } from "@/components/landing/Hero";
import { LearnMore } from "@/components/landing/LearnMore";
import { AboutUs } from "@/components/landing/AboutUs";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { FALLBACK, fetchValidatorStats, type ValidatorStats } from "@/lib/endur";
import { fetchPrices, type Prices } from "@/lib/prices";

export default function Page() {
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { starknetkitConnectModal } = useStarknetkitConnectModal({
    connectors: connectors as never,
    dappName: "Unwrap Labs Validator",
  });

  const [stats, setStats] = useState<ValidatorStats>(FALLBACK);
  const [prices, setPrices] = useState<Prices>({ strk: null, btc: null });

  useEffect(() => {
    const ac = new AbortController();
    // On failure we keep the last known values and the UI says so, rather than
    // showing a spinner forever or an empty page.
    fetchValidatorStats(ac.signal)
      .then(setStats)
      .catch(() => setStats(FALLBACK));
    // Prices are decorative here: if they do not arrive, money figures are
    // simply omitted rather than guessed.
    void fetchPrices().then(setPrices);
    return () => ac.abort();
  }, []);

  const openWallet = async () => {
    const { connector } = await starknetkitConnectModal();
    if (connector) connect({ connector: connector as never });
  };

  return (
    <>
      <Header />

      {isConnected ? (
        <Dashboard stats={stats} />
      ) : (
        <main>
          {/* Section 1: the claim, with the auto-claim rail beside it. */}
          <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-12 px-5 py-14 md:px-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
            <Hero stats={stats} prices={prices} />
            <AutoClaimRail onActivate={openWallet} ctaLabel="Connect wallet to turn it on" />
          </div>
        </main>
      )}

      {/* Sections 2-4 stay on the page in both states: a connected delegator
          still needs somewhere to read what the receiver does before opting in. */}
      <LearnMore />
      <AboutUs />
      <AtSize />
      <Footer />
    </>
  );
}
