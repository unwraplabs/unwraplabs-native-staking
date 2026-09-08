import { NextResponse } from "next/server";
import { runKeeper } from "@/lib/keeper";

/**
 * Weekly keeper run, triggered by the Vercel cron in `vercel.json`.
 *
 * Kept on Node rather than the edge runtime: it signs Starknet transactions and
 * makes long sequential RPC calls, neither of which the edge runtime suits.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Without a secret configured, only allow the run outside production. A cron
  // endpoint that moves funds must not be openly callable by accident.
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  try {
    const result = await runKeeper({ dryRun });
    // 200 even with individual failures: the run itself succeeded, and the
    // counts say what happened. A non-200 here would make Vercel retry the
    // whole sweep, re-sending transactions that already landed.
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "keeper run failed" },
      { status: 500 },
    );
  }
}
