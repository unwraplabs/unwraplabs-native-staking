/**
 * Declare the receiver class, then deploy the factory that builds receivers
 * from it.
 *
 * Uses the strkfarm SDK's account handling, so this runs with the same
 * encrypted account store as the rest of our infrastructure and there is no
 * private key in an environment variable anywhere.
 *
 *   ACCOUNT_SECURE_PASSWORD=... npm run deploy:dry   # nothing is sent
 *   ACCOUNT_SECURE_PASSWORD=... npm run deploy
 *
 * Optional environment:
 *   DEPLOY_ACCOUNT       account key in the store       (default: "unwrap-deployer")
 *   ACCOUNTS_FILE_NAME   store file                     (default: the SDK's)
 *   RPC_URL              node to use                    (default: config/mainnet.json)
 *
 * The factory is deployed once and never changed. To alter receiver code or add
 * an out-token you deploy a NEW factory: existing receivers keep working,
 * because nothing points at the factory after deployment.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Deployer, getMainnetConfig } from "@strkfarm/sdk";
import { shortString } from "starknet";
import { config } from "dotenv";

config();

// CommonJS on purpose — see package.json. That also means `__dirname` rather
// than `import.meta.url`.
const ROOT = join(__dirname, "..");
const CONTRACTS = join(ROOT, "contracts");
const CONFIG = join(ROOT, "config/mainnet.json");
const PACKAGE = "unwrap_staking";
const DRY_RUN = process.argv.includes("--dry-run");

type TokenConfig = { symbol: string; address: string; decimals: number; pair: string };
type Config = {
  rpc: string;
  strk: { address: string; decimals: number; pair: string };
  oracle: string;
  router: string;
  outTokens: TokenConfig[];
  deployed: { handlerClassHash: string | null; factory: string | null };
};

function loadConfig(): Config {
  return JSON.parse(readFileSync(CONFIG, "utf8")) as Config;
}

function saveConfig(update: Partial<Config["deployed"]>) {
  const raw = JSON.parse(readFileSync(CONFIG, "utf8"));
  raw.deployed = { ...raw.deployed, ...update };
  writeFileSync(CONFIG, JSON.stringify(raw, null, 2) + "\n");
}

/**
 * Factory constructor calldata, built from the config file rather than typed at
 * a terminal, so the deployed token table is exactly what the repo says it is.
 *
 * Everything security-relevant is supplied by the factory to each receiver, not
 * by whoever calls `deploy_handler` — the oracle, the router, the 1% slippage
 * ceiling, and each token's decimals and Pragma pair. That is what stops anyone
 * deploying a receiver pointed at a thin feed and still landing on an address
 * this factory would produce.
 */
function factoryCalldata(cfg: Config): string[] {
  if (!cfg.deployed.handlerClassHash) throw new Error("handler class hash not set yet");

  const calldata = [
    cfg.deployed.handlerClassHash,
    cfg.strk.address,
    String(cfg.strk.decimals),
    shortString.encodeShortString(cfg.strk.pair),
    cfg.oracle,
    cfg.router,
    String(cfg.outTokens.length), // Array<TokenConfig> length prefix
  ];
  for (const t of cfg.outTokens) {
    calldata.push(t.address, String(t.decimals), shortString.encodeShortString(t.pair));
  }
  return calldata;
}

async function main() {
  const cfg = loadConfig();
  const config = getMainnetConfig(process.env.RPC_URL || cfg.rpc);

  console.log(`network : ${config.network}`);
  console.log(`rpc     : ${process.env.RPC_URL || cfg.rpc}`);
  console.log(`mode    : ${DRY_RUN ? "DRY RUN — nothing will be sent" : "LIVE"}`);
  console.log();

  console.log("out-token table to be written into the factory:");
  for (const t of cfg.outTokens) {
    console.log(`  ${t.symbol.padEnd(9)} decimals=${String(t.decimals).padEnd(2)} pair=${t.pair}`);
  }
  console.log();

  if (DRY_RUN) {
    // Show the calldata with a placeholder class hash so the shape can be
    // checked without declaring anything.
    const preview = { ...cfg, deployed: { ...cfg.deployed, handlerClassHash: cfg.deployed.handlerClassHash ?? "0x0" } };
    console.log("factory constructor calldata (class hash may be a placeholder):");
    factoryCalldata(preview).forEach((f, i) => console.log(`  [${String(i).padStart(2)}] ${f}`));
    console.log("\nDry run complete. Nothing was sent.");
    return;
  }

  const accountKey = process.env.DEPLOY_ACCOUNT || "unwrap-deployer";
  const account = Deployer.getAccount(
    accountKey,
    config,
    process.env.ACCOUNT_SECURE_PASSWORD,
    process.env.ACCOUNTS_FILE_NAME,
  );
  console.log(`deployer: ${accountKey} (${account.address})\n`);

  // `myDeclare` reads ./target/release/<package>_<contract>.{contract_class,
  // compiled_contract_class}.json and writes ./contracts.json, both relative to
  // the working directory. Move there rather than duplicating its path logic.
  process.chdir(CONTRACTS);

  // Rebuild rather than trusting whatever is on disk. Declaring a stale class
  // is the one mistake here that is invisible until someone verifies the hash
  // and finds it does not match the source.
  //
  // Note `--release` is a global scarb flag, not a `build` flag, and the
  // release profile must emit CASM (`casm = true` in Scarb.toml) because a
  // declare needs the compiled class hash as well as the Sierra.
  console.log("==> Building contracts (release)");
  execSync("scarb --release build", { stdio: "inherit" });
  console.log();

  console.log("==> Declaring RewardsHandler");
  const handler = await Deployer.myDeclare("RewardsHandler", PACKAGE, config, account);
  console.log(`    class hash: ${handler.class_hash}`);
  saveConfig({ handlerClassHash: handler.class_hash });

  console.log("\n==> Declaring HandlerFactory");
  const factoryClass = await Deployer.myDeclare("HandlerFactory", PACKAGE, config, account);
  console.log(`    class hash: ${factoryClass.class_hash}`);

  // Re-read: the handler class hash was only just written.
  const calldata = factoryCalldata(loadConfig());
  console.log("\n==> Deploying HandlerFactory");
  calldata.forEach((f, i) => console.log(`    [${String(i).padStart(2)}] ${f}`));

  const deployed = await Deployer.deployContract(
    "HandlerFactory",
    factoryClass.class_hash,
    calldata,
    config,
    account,
  );
  console.log(`\n    factory: ${deployed.contract_address}`);
  saveConfig({ factory: deployed.contract_address });

  console.log("\nRecorded in config/mainnet.json. Next:");
  console.log("  scripts/verify-class-hash.sh    confirm the deployed class is this source");
  console.log("  node scripts/verify-feeds.mjs   confirm every Pragma feed still qualifies");
}

main().catch((e) => {
  console.error("\ndeploy failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
