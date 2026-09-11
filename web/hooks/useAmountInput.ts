import { useCallback, useState } from "react";
import { exactUnits, formatUnits, parseUnits, unitsToInput } from "@/lib/format";

/**
 * An amount field bounded by an on-chain balance, in exact base units.
 *
 * Every field that turns typed text into calldata goes through this, so none
 * of them can reintroduce a float. Round-tripping an 18-decimal balance through
 * a double can come back *larger* than it went in — a MAX that asks for more
 * than the balance, and a transaction that reverts.
 *
 * @param limit    the most that can go in, in base units
 * @param decimals the token's decimals
 * @param dp       places to show when filling or displaying the limit
 */
export function useAmountInput(limit: bigint, decimals: number, dp: number) {
  const [value, setValue] = useState("");
  // Set by MAX and cleared by any keystroke. While set, the parsed amount is
  // the exact limit rather than the truncated figure in the field — otherwise
  // "everything" would leave a few wei behind.
  const [whole, setWhole] = useState(false);

  // What MAX puts in the field: plain digits, since a formatted figure would
  // not parse back. Normally truncated to dp; a balance too small to survive
  // that (0.0004 STRK at 2dp is "0.00") goes in whole, or the field reads zero.
  const truncated = unitsToInput(limit, decimals, dp);
  const fill =
    limit > 0n && parseUnits(truncated, decimals) === 0n ? exactUnits(limit, decimals) : truncated;

  const parsed = whole ? limit : parseUnits(value, decimals);
  const malformed = value.trim() !== "" && parsed === null;
  const tooMuch = parsed !== null && parsed > limit;
  // Stable, so it can sit in an effect's dependencies.
  const reset = useCallback(() => {
    setValue("");
    setWhole(false);
  }, []);

  return {
    value,
    /** The amount in base units, or null when the field is empty or malformed. */
    parsed,
    malformed,
    tooMuch,
    /** A positive amount within the limit. */
    valid: parsed !== null && parsed > 0n && !tooMuch,
    /** The limit for display, compacted or subscripted as needed. */
    ceiling: formatUnits(limit, decimals, dp),
    set: (next: string) => {
      setValue(next);
      setWhole(false);
    },
    max: () => {
      setValue(fill);
      setWhole(true);
    },
    reset,
  };
}
