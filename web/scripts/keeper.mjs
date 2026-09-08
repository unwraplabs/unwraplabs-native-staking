#!/usr/bin/env node
/**
 * Standalone keeper, for running on Render (or cron, or a laptop) instead of
 * Vercel. Same code path as the scheduled route — this only supplies argv and
 * an exit code.
 *
 *   node scripts/keeper.mjs --dry-run
 *
 * Environment:
 *   KEEPER_ADDRESS       account that sends the transactions
 *   KEEPER_PRIVATE_KEY   its key. Needs gas only; it can never take the funds.
 *   RPC_URL              optional, overrides the configured endpoint
 */
import { runKeeper } from "../lib/keeper.js";

const dryRun = process.argv.includes("--dry-run");

const result = await runKeeper({ dryRun });

// Non-zero when any individual dispatch failed, so a supervisor notices.
process.exit(result.failed > 0 ? 1 : 0);
