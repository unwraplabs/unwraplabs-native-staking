/**
 * Placeholder shapes for content still in flight.
 *
 * Sized to the real thing so the layout does not jump when data lands — a card
 * that reflows on arrival reads as a glitch even when it was fast.
 */
function Bar({ w, h = 12 }: { w: string; h?: number }) {
  return (
    <span
      className="block animate-pulse rounded-[2px] bg-line-2"
      style={{ width: w, height: h }}
    />
  );
}

/** Mirrors PositionCard's shell, figures, auto-claim row and action stack. */
export function PositionSkeleton() {
  return (
    <div
      className="flex min-w-0 flex-col gap-[26px] rounded-lg border border-card-line bg-white p-7"
      aria-hidden
    >
      <div className="flex items-center gap-3">
        <span className="h-[30px] w-[30px] animate-pulse rounded-full bg-line-2" />
        <Bar w="70px" h={18} />
        <span className="ml-auto">
          <Bar w="76px" />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-7">
        <div className="space-y-2">
          <Bar w="46px" />
          <Bar w="140px" h={32} />
          <Bar w="58px" />
        </div>
        <div className="space-y-2">
          <Bar w="112px" />
          <Bar w="110px" h={32} />
          <Bar w="86px" />
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-card-hair pt-[22px]">
        <span className="h-5 w-9 animate-pulse rounded-full bg-line-2" />
        <Bar w="104px" h={14} />
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <Bar w="100%" h={44} />
        <div className="grid grid-cols-2 gap-2.5">
          <Bar w="100%" h={38} />
          <Bar w="100%" h={38} />
        </div>
        <Bar w="100%" h={38} />
        {/* The card's hint line, which is reserved even when empty. */}
        <span className="block h-[18px]" />
      </div>

      <div className="border-t border-card-hair pt-4">
        <Bar w="58px" />
      </div>
    </div>
  );
}

/** Shown inside a card while its receiver's event log is still being read. */
export function ActivitySkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <Bar w="128px" />
      <div className="mt-3 flex gap-10">
        <div className="space-y-2">
          <Bar w="118px" />
          <Bar w="88px" h={18} />
        </div>
        <div className="space-y-2">
          <Bar w="72px" />
          <Bar w="96px" h={18} />
        </div>
      </div>
    </div>
  );
}

export function RailSkeleton() {
  return (
    <div className="border border-line p-5" aria-hidden>
      <Bar w="164px" h={16} />
      <div className="mt-3 space-y-2">
        <Bar w="100%" />
        <Bar w="92%" />
        <Bar w="64%" />
      </div>
    </div>
  );
}
