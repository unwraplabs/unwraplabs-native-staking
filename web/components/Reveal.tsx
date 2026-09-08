"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Fade up from below, once, as the element enters view.
 *
 * Deliberately restrained: 18px of travel and a soft-landing ease. The point is
 * that content settles rather than announces itself. Anything larger reads as a
 * slide-in and starts competing with the copy.
 *
 * Honours `prefers-reduced-motion` by rendering the final state immediately —
 * not a shorter animation, no animation.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
  onMount = false,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "tr";
  /**
   * Animate on mount instead of on scroll. Use for anything above the fold.
   *
   * Scroll-triggered reveals depend on an IntersectionObserver callback, and
   * content that starts at `opacity: 0` waiting for one is content that stays
   * invisible if that callback is late — in a background tab, on a throttled
   * device. That is an acceptable risk for a section far down the page and an
   * unacceptable one for the headline, so the headline does not take it.
   */
  onMount?: boolean;
}) {
  const reduced = useReducedMotion();
  const Component = motion[as];

  if (reduced) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }

  const transition = { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] as const };
  const from = { opacity: 0, y: 18 };
  const to = { opacity: 1, y: 0 };

  if (onMount) {
    return (
      <Component className={className} initial={from} animate={to} transition={transition}>
        {children}
      </Component>
    );
  }

  return (
    <Component
      className={className}
      initial={from}
      whileInView={to}
      // Shrink only the bottom edge, so a reveal fires just before the element
      // is fully on screen. Shrinking every edge (a bare "-64px") also pulls the
      // top in, which delays elements sitting near the top of the viewport.
      viewport={{ once: true, margin: "0px 0px -64px 0px", amount: 0.05 }}
      transition={transition}
    >
      {children}
    </Component>
  );
}

/**
 * Staggers its children through `Reveal`'s timing without each call site having
 * to compute a delay. Used for the claim rows and the pillar grid.
 */
export function RevealGroup({
  children,
  className,
  step = 0.07,
  start = 0,
}: {
  children: ReactNode[];
  className?: string;
  step?: number;
  start?: number;
}) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <Reveal key={i} delay={start + i * step}>
          {child}
        </Reveal>
      ))}
    </div>
  );
}
