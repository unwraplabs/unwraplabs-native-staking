"use client";

import { useState, type ReactNode } from "react";

/**
 * A hairline-underlined term that explains itself.
 *
 * Opens on hover and on focus, so it is reachable from a keyboard, and it is
 * rendered as a sibling rather than a `title` attribute so the copy can be more
 * than a few words.
 */
export function Tooltip({ label, children }: { label: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label="What is this?"
        className="cursor-help border-b border-dotted border-ink-3 text-left"
      >
        {label}
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute bottom-full left-0 z-20 mb-2 w-[260px] border border-line bg-white p-3 text-[12.5px] leading-relaxed text-ink-2"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
