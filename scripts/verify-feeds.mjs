#!/usr/bin/env node
// Reads every Pragma feed the factory would be configured with, straight from
// the oracle, and reports whether it clears the handler's hardcoded bounds.
//
// Run this before any deploy. The handler refuses a feed with fewer than three
// aggregated sources or one older than an hour, so a feed that thins out does
// not degrade the swap — it disables it. Better to find that here.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(join(root, "config/mainnet.json"), "utf8"));

const MIN_SOURCES = 3;
const MAX_AGE = 3600;

const shortString = (s) => "0x" + Buffer.from(s, "ascii").toString("hex");

// starknet_keccak("get_data_median")
const SELECTOR =
  "0x0024b869ce68dd257b370701ca16e4aaf9c6483ff6805d04ba7661f3a0b6ce59";

async function median(pair) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "starknet_call",
    params: [
      {
        contract_address: cfg.oracle,
        entry_point_selector: SELECTOR,
        calldata: ["0x0", shortString(pair)],
      },
      "latest",
    ],
  };
  const r = await fetch(cfg.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
  if (r.error) throw new Error(r.error.message);
  const [price, decimals, ts, sources] = r.result.map((h) => Number(BigInt(h)));
  return { price, decimals, ts, sources };
}

const now = Math.floor(Date.now() / 1000);
let bad = 0;

const pairs = [
  { symbol: "STRK (reward token)", pair: cfg.strk.pair },
  ...cfg.outTokens.map((t) => ({ symbol: t.symbol, pair: t.pair, note: t.note })),
];

console.log(`Pragma oracle ${cfg.oracle}\n`);
for (const { symbol, pair, note } of pairs) {
  let line;
  try {
    const m = await median(pair);
    const age = now - m.ts;
    const problems = [];
    if (m.price <= 0) problems.push("no price");
    if (m.sources < MIN_SOURCES) problems.push(`${m.sources} sources < ${MIN_SOURCES}`);
    if (age > MAX_AGE) problems.push(`${age}s old > ${MAX_AGE}s`);
    const value = m.decimals ? (m.price / 10 ** m.decimals).toLocaleString("en-US", {
      maximumFractionDigits: 4,
    }) : "0";
    line = problems.length
      ? `FAIL  ${symbol.padEnd(20)} ${pair.padEnd(12)} ${problems.join(", ")}`
      : `ok    ${symbol.padEnd(20)} ${pair.padEnd(12)} $${value}, ${m.sources} sources, ${age}s old`;
    if (problems.length) bad++;
  } catch (e) {
    line = `FAIL  ${symbol.padEnd(20)} ${pair.padEnd(12)} ${e.message}`;
    bad++;
  }
  console.log(line);
  if (note?.startsWith("REVIEW")) console.log(`      ^ ${note}`);
}

console.log();
if (bad) {
  console.error(`${bad} feed(s) would not satisfy the handler. Do not deploy as configured.`);
  process.exit(1);
}
console.log("All configured feeds clear the handler's bounds.");
