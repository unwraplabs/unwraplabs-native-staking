/** Display helpers. Every numeral rendered through these is tabular mono. */

const nf = (min: number, max: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });

export function num(value: number, decimals = 0): string {
  return nf(decimals, decimals).format(value);
}

/** Scales a raw on-chain integer down by its token decimals. */
export function fromUnits(raw: bigint | string | number, decimals: number): number {
  const asBig = typeof raw === "bigint" ? raw : BigInt(Math.trunc(Number(raw)));
  const base = 10n ** BigInt(decimals);
  const whole = asBig / base;
  const frac = asBig % base;
  return Number(whole) + Number(frac) / Number(base);
}

/** The API returns some totals in scientific notation as strings. */
/**
 * Parses a typed decimal amount straight to base units, with no float in
 * between. Returns null for anything that is not a plain non-negative decimal,
 * or that carries more fractional digits than the token has.
 *
 * Going through `Number` here is not a rounding nicety: an 18-decimal balance
 * round-tripped through a double can come back *larger* than it went in, and a
 * transaction for more than you hold reverts.
 */
export function parseUnits(input: string, decimals: number): bigint | null {
  const s = input.trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [whole, frac = ""] = s.split(".");
  if (frac.length > decimals) return null;
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}

/**
 * Base units as a plain decimal string for an input field: no grouping (a comma
 * would not parse back), and truncated rather than rounded, so it never shows
 * more than is actually there.
 */
export function unitsToInput(raw: bigint, decimals: number, dp: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = (raw / base).toString();
  if (dp === 0) return whole;
  const frac = (raw % base).toString().padStart(decimals, "0").slice(0, dp).padEnd(dp, "0");
  return `${whole}.${frac}`;
}

export function fromUnitsLoose(raw: string | number, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

/** 80,881,008 -> "80.9M". Used where the exact figure would be noise. */
export function compact(value: number, decimals = 1): string {
  if (value >= 1e9) return `${num(value / 1e9, decimals)}B`;
  if (value >= 1e6) return `${num(value / 1e6, decimals)}M`;
  if (value >= 1e3) return `${num(value / 1e3, decimals)}K`;
  return num(value, decimals);
}

export function usd(value: number): string {
  if (value >= 1e6) return `$${num(value / 1e6, 2)}M`;
  if (value >= 1e3) return `$${num(value / 1e3, 1)}K`;
  return `$${num(value, 2)}`;
}

/** 0x024ed3…95c2 */
export function shortHex(address: string, lead = 6, tail = 4): string {
  if (!address) return "";
  const clean = address.startsWith("0x") ? address : `0x${address}`;
  if (clean.length <= lead + tail + 2) return clean;
  return `${clean.slice(0, lead)}…${clean.slice(-tail)}`;
}

/** Pads to the 66-char form so two addresses compare correctly. */
export function normalizeAddress(address: string | bigint | undefined): string {
  if (address === undefined || address === null || address === "") return "";
  const hex = typeof address === "bigint" ? address.toString(16) : BigInt(address).toString(16);
  return `0x${hex.padStart(64, "0")}`;
}

export function sameAddress(a?: string | bigint, b?: string | bigint): boolean {
  if (!a || !b) return false;
  try {
    return BigInt(a as string) === BigInt(b as string);
  } catch {
    return false;
  }
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export function timeAgo(iso: string | number | Date): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export function monthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
