#!/usr/bin/env node
// Extracts the ABIs from the compiled Sierra artifacts into the web app.
//
// Hand-copied ABIs drift the moment a signature changes and then fail at
// runtime in the browser, which is the worst place to find out. These are
// generated from the same build the class hash is computed from.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "contracts/target/dev");
const out = join(root, "web/lib/abi");

if (!existsSync(join(target, "unwrap_staking_RewardsHandler.contract_class.json"))) {
  console.log("sync-abi: no build found, running `scarb build`...");
  execSync("scarb build", { cwd: join(root, "contracts"), stdio: "inherit" });
}

mkdirSync(out, { recursive: true });

for (const [contract, file] of [
  ["RewardsHandler", "handler"],
  ["HandlerFactory", "factory"],
]) {
  const src = join(target, `unwrap_staking_${contract}.contract_class.json`);
  const { abi } = JSON.parse(readFileSync(src, "utf8"));
  writeFileSync(join(out, `${file}.json`), JSON.stringify(abi, null, 2) + "\n");
  console.log(`sync-abi: ${contract} -> web/lib/abi/${file}.json (${abi.length} entries)`);
}
