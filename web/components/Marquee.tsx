"use client";

/**
 * The announcement rail, above the nav.
 *
 * Two standing notices, not a news ticker. The first is the offer and carries
 * the only control in the strip; the second is the fee change, stated plainly
 * because burying a price increase in a footnote is how you lose the trust the
 * rest of this page is trying to earn.
 *
 * The track is duplicated so the loop is seamless, pauses on hover so it can
 * actually be read, and does not move at all under reduced motion.
 */
const DOT = <span className="text-ink-3 select-none">·</span>;

function Item({ onJump }: { onJump: () => void }) {
  return (
    <span className="flex items-center gap-3 whitespace-nowrap px-6">
      <span className="text-white">
        Automated reward claiming, free for every delegator.
      </span>
      <button
        onClick={onJump}
        className="rounded-[3px] bg-white px-2.5 py-[3px] font-mono text-[11px] font-medium text-ink transition-colors hover:bg-neutral-200"
      >
        See how it works
      </button>
      {/* Held back until the fee change is actually scheduled. Restore by
          uncommenting — the marquee loop handles one or two items either way.
      <span className="px-3">{DOT}</span>
      <span className="text-neutral-400">
        Validator fee moves to 5% from November 2026.
      </span>
      */}
      <span className="px-3">{DOT}</span>
    </span>
  );
}

export function Marquee() {
  const jump = () => {
    document.getElementById("auto-claim")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="marquee overflow-hidden bg-ink text-[12.5px] leading-none">
      <div className="marquee-track flex w-max py-2.5">
        {/* Two identical tracks: the animation translates by exactly -50%, so
            the second lands where the first began and the seam is invisible. */}
        {[0, 1].map((copy) => (
          <span key={copy} className="flex" aria-hidden={copy === 1}>
            <Item onJump={jump} />
            <Item onJump={jump} />
          </span>
        ))}
      </div>
    </div>
  );
}
