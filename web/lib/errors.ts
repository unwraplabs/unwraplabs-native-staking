/**
 * What to tell a delegator when a transaction does not go through.
 *
 * Wallet and RPC errors arrive as whatever string the wallet chose, e.g.
 * "An error occurred (USER_REFUSED_OP)". Declining in the wallet is not a
 * failure — it is the delegator changing their mind — so it gets a neutral
 * message, not an error.
 */
export type TxOutcome = { kind: "info" | "error"; text: string };

const DECLINED = /USER_REFUSED_OP|user (?:abort|reject|refus|cancel|denied)/i;

export function describeTxError(e: unknown): TxOutcome {
  const message = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (DECLINED.test(message)) {
    return { kind: "info", text: "You rejected the transaction." };
  }
  return { kind: "error", text: message || "The transaction failed." };
}
