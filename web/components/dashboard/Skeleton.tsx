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

/** Mirrors PositionCard's header, figures and action row. */
export function PositionSkeleton() {
  return (
    <div className="min-w-0 border-t border-line py-6" aria-hidden>
      <div className="mb-4 flex items-center gap-3">
        <span className="h-[26px] w-[26px] animate-pulse rounded-full bg-line-2" />
        <Bar w="70px" h={16} />
        <span className="ml-auto">
          <Bar w="76px" />
        </span>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-5">
        <div className="space-y-2">
          <Bar w="46px" />
          <Bar w="140px" h={24} />
          <Bar w="58px" />
        </div>
        <div className="space-y-2">
          <Bar w="112px" />
          <Bar w="110px" h={24} />
          <Bar w="86px" />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Bar w="104px" h={36} />
        <Bar w="112px" h={36} />
        <Bar w="132px" h={36} />
        <Bar w="122px" h={36} />
      </div>
    </div>
  );
}

/** Shown inside a card while its receiver's event log is still being read. */
export function ActivitySkeleton() {
  return (
    <div className="mt-5 border border-line p-3" aria-hidden>
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
