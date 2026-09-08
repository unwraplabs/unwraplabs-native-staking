import raw from "./chain.config.json";

/**
 * Chain configuration, generated from `config/mainnet.json` at the repo root by
 * `scripts/sync-config.mjs`. Do not edit `chain.config.json` directly — edit the
 * root file, which the deploy scripts also read, so the app and the contracts
 * can never disagree about an address.
 */
export type OutToken = {
  symbol: string;
  address: string;
  decimals: number;
  pair: string;
  note?: string;
};

export type ChainConfig = {
  network: string;
  chainId: string;
  rpc: string;
  strk: { address: string; decimals: number; pair: string };
  oracle: string;
  router: string;
  outTokens: OutToken[];
  deployed: { handlerClassHash: string | null; factory: string | null };
};

export const config = raw as unknown as ChainConfig;

/** Our validator on Starknet mainnet. */
export const VALIDATOR = {
  name: "Unwrap Labs",
  /** Staker address, which is also how the Endur API keys us. */
  address: "0x024ed354f5b69825100a1833248bb773ef11722b8b1efc845b97acc5976695c2",
  /** The STRK delegation pool. */
  strkPool: "0x009a3b7236dbaa9006ac0f9add671981f11fba944f08c8bd9ca788e6eda7dc89",
} as const;

/**
 * One delegation pool per staked asset. A delegator can be a member of several
 * of these at once, which is why a subscription is keyed by (pool, member) and
 * not by member alone.
 *
 * Pool addresses come from the Endur validator API's `btc_tokens_info`, checked
 * against the token addresses in the root config.
 *
 * Declaration order is the display order for a delegator with no position yet.
 * Once they hold something, `sortPositions` reorders by value.
 */
export type PoolInfo = {
  symbol: string;
  /** Staked token. Rewards are always paid in STRK regardless. */
  token: string;
  decimals: number;
  pool: string;
  kind: "strk" | "btc";
  /**
   * The token a receiver for this pool pays out in. `null` means pass-through:
   * rewards are forwarded as STRK with no swap.
   */
  payoutToken: string | null;
  icon: string;
};

export const POOLS: PoolInfo[] = [
  {
    symbol: "STRK",
    token: config.strk.address,
    decimals: 18,
    pool: VALIDATOR.strkPool,
    kind: "strk",
    payoutToken: null,
    icon: "/tokens/strk.png",
  },
  {
    symbol: "SolvBTC",
    token: "0x0593e034dda23eea82d2ba9a30960ed42cf4a01502cc2351dc9b9881f9931a68",
    decimals: 18,
    pool: "0x03aa1804ffa96794fe8ce85f338496db222b5cf7d391959df0179b91e2ab1c17",
    kind: "btc",
    payoutToken: "0x0593e034dda23eea82d2ba9a30960ed42cf4a01502cc2351dc9b9881f9931a68",
    icon: "/tokens/solvbtc.png",
  },
  {
    symbol: "strkBTC",
    token: "0x0787150e306e6eae6e3f79dea881770e8bbff2c1b8eb490f969669ee945b3135",
    decimals: 8,
    pool: "0x03ed105ceacf98961434cff80251b24d14135cc77158ab180987ad29c4047949",
    kind: "btc",
    payoutToken: "0x0787150e306e6eae6e3f79dea881770e8bbff2c1b8eb490f969669ee945b3135",
    icon: "/tokens/strkbtc.svg",
  },
  {
    symbol: "WBTC",
    token: "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",
    decimals: 8,
    pool: "0x05b68011897efef3d2ac65159b500753968305f2c46f7737f895131890c5d1d9",
    kind: "btc",
    payoutToken: "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",
    icon: "/tokens/wbtc.png",
  },
];

/**
 * The stake at which automated claiming runs on a dependable schedule.
 *
 * To be explicit, because a greyed-out button invites the opposite conclusion:
 * this gates nothing. Auto-claim can be turned on at any size, the contract has
 * no minimum, and no control on this page is disabled because of it. All it
 * decides is which sentence about cadence the card shows — a small position may
 * not accrue enough between runs to be worth the gas we pay, so it is claimed
 * once it has accumulated enough.
 *
 * Overridable so a small position can be exercised end to end on mainnet
 * without editing code:
 *
 *   NEXT_PUBLIC_SERVICE_MIN_USD=1
 *   NEXT_PUBLIC_SERVICE_MIN_BTC=0.00001
 *   NEXT_PUBLIC_SERVICE_MIN_STRK=1
 */
const envNumber = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const SERVICE_MINIMUM_USD = envNumber(
  process.env.NEXT_PUBLIC_SERVICE_MIN_USD,
  100_000,
);

/** Used when the price API is unreachable and USD comparison is impossible. */
export const SERVICE_MINIMUM_FALLBACK = {
  btc: envNumber(process.env.NEXT_PUBLIC_SERVICE_MIN_BTC, 1),
  strk: envNumber(process.env.NEXT_PUBLIC_SERVICE_MIN_STRK, 5_000_000),
} as const;

export const poolBySymbol = (symbol: string) => POOLS.find((p) => p.symbol === symbol);

export const EXPLORER = "https://voyager.online";
export const explorerContract = (address: string) => `${EXPLORER}/contract/${address}`;
export const explorerClass = (hash: string) => `${EXPLORER}/class/${hash}`;
export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;

export const LINKS = {
  validatorRecord:
    "https://dashboard.endur.fi/validator/0x024ed354f5b69825100a1833248bb773ef11722b8b1efc845b97acc5976695c2",
  endur: "https://app.endur.fi",
  endurGithub: "https://github.com/Endur-fi",
  troves: "https://app.troves.fi",
  trovesGithub: "https://github.com/trovesfi",
  github: "https://github.com/unwraplabs",
  repo: "https://github.com/unwraplabs/unwraplabs-native-staking",
  site: "https://www.unwraplabs.com/",
  telegram: "https://t.me/akirabuilds",
  email: "akira@unwraplabs.com",
} as const;
