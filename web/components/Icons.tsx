/**
 * Action marks.
 *
 * Deliberately plain 1.6px strokes on a 24px grid, so they read as part of the
 * hairline rules rather than as decoration competing with the numerals.
 */
const base = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Stake: value moving down into a holding. */
export const StakeIcon = () => (
  <svg {...base}>
    <path d="M12 3v11" />
    <path d="m7.5 9.5 4.5 4.5 4.5-4.5" />
    <path d="M4 18.5h16" />
  </svg>
);

/** Unstake: value lifting back out. */
export const UnstakeIcon = () => (
  <svg {...base}>
    <path d="M12 15V4" />
    <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
    <path d="M4 19.5h16" />
  </svg>
);

/** Claim: collecting what has accrued. */
export const ClaimIcon = () => (
  <svg {...base}>
    <ellipse cx="12" cy="6" rx="7" ry="2.8" />
    <path d="M5 6v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6" />
    <path d="M5 11v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5" />
  </svg>
);

/** Switch: two flows crossing between validators. */
export const SwitchIcon = () => (
  <svg {...base}>
    <path d="M4 8h13" />
    <path d="m14 5 3 3-3 3" />
    <path d="M20 16H7" />
    <path d="m10 13-3 3 3 3" />
  </svg>
);

/** Disclosure caret. Rotated 90° by the caller when its panel is open. */
export const CaretIcon = () => (
  <svg {...base} width={13} height={13}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);
