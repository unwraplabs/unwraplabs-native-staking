import { describe, expect, it } from "vitest";
import { describeTxError } from "@/lib/errors";

describe("describeTxError", () => {
  it("treats declining in the wallet as a cancellation, not an error", () => {
    for (const msg of [
      "An error occurred (USER_REFUSED_OP)",
      "User abort",
      "User rejected the request",
      "user denied transaction signature",
    ]) {
      expect(describeTxError(new Error(msg)).kind).toBe("info");
    }
  });

  it("passes real failures through as errors", () => {
    const out = describeTxError(new Error("Pool member does not exist"));
    expect(out).toEqual({ kind: "error", text: "Pool member does not exist" });
  });

  it("never shows an empty message", () => {
    expect(describeTxError(undefined).text).toBe("The transaction failed.");
    expect(describeTxError(new Error("")).text).toBe("The transaction failed.");
  });
});
