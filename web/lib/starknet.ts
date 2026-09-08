import { RpcProvider } from "starknet";
import { config } from "./config";

/**
 * Read-only provider. Used for everything the page displays; writes go through
 * the connected wallet's account instead.
 *
 * `NEXT_PUBLIC_RPC_URL` lets a deployment point at its own node without a code
 * change — the public endpoint in the config is a sensible default, not a
 * dependency we want in the hot path forever.
 */
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || config.rpc;

let cached: RpcProvider | null = null;

export function provider(): RpcProvider {
  if (!cached) cached = new RpcProvider({ nodeUrl: RPC_URL });
  return cached;
}
