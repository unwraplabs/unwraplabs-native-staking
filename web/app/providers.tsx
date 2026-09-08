"use client";

import { mainnet } from "@starknet-react/chains";
import { StarknetConfig, jsonRpcProvider, voyager } from "@starknet-react/core";
import { ArgentMobileConnector } from "starknetkit/argentMobile";
import { InjectedConnector } from "starknetkit/injected";
import { WebWalletConnector } from "starknetkit/webwallet";
import { useMemo, type ReactNode } from "react";
import { RPC_URL } from "@/lib/starknet";

/**
 * Wallet wiring.
 *
 * Starknetkit supplies the connectors and the modal; starknet-react supplies
 * the hooks. The connector list is built once and memoised — rebuilding it on
 * every render makes the modal forget an in-flight connection attempt.
 */
export function Providers({ children }: { children: ReactNode }) {
  const connectors = useMemo(
    () => [
      new InjectedConnector({ options: { id: "argentX", name: "Argent X" } }),
      new InjectedConnector({ options: { id: "braavos", name: "Braavos" } }),
      new InjectedConnector({ options: { id: "keplr", name: "Keplr" } }),
      // Mobile matters here: a lot of delegators will open this on a phone.
      ArgentMobileConnector.init({
        options: { dappName: "Unwrap Labs Validator", url: "https://validator.unwraplabs.com" },
      }),
      new WebWalletConnector({ url: "https://web.argent.xyz" }),
    ],
    [],
  );

  const provider = useMemo(() => jsonRpcProvider({ rpc: () => ({ nodeUrl: RPC_URL }) }), []);

  return (
    <StarknetConfig
      chains={[mainnet]}
      provider={provider}
      connectors={connectors as never}
      explorer={voyager}
      autoConnect
    >
      {children}
    </StarknetConfig>
  );
}
