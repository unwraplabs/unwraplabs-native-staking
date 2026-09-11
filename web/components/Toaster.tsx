"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon } from "@/components/Icons";

export type Toast = { id: number; kind: "info" | "error"; text: string };

/** Errors stay long enough to read a wallet message; a cancellation needs less. */
const LIFETIME = { info: 4000, error: 8000 } as const;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = next.current++;
    // Newest last, and the same message twice collapses to one rather than
    // stacking — a double click should not produce two identical errors.
    setToasts((all) => [...all.filter((t) => t.text !== text), { id, kind, text }]);
  }, []);

  return { toasts, push, dismiss };
}

/**
 * Transient messages, bottom right (bottom centre on narrow screens), above
 * dialogs. They report the outcome of something the delegator just did, so
 * they sit apart from the page rather than pushing its content down.
 */
export function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);

  // Paused while hovered, so a long message can be read to the end.
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), LIFETIME[toast.kind]);
    return () => clearTimeout(timer);
  }, [paused, toast.id, toast.kind, onDismiss]);

  const error = toast.kind === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`pointer-events-auto flex w-full max-w-[380px] items-start gap-3 rounded-lg border bg-white py-3 pl-4 pr-2 text-[13px] ${
        error ? "border-btc" : "border-ink"
      }`}
    >
      {error ? <span className="mt-[5px] h-1.5 w-1.5 flex-none rounded-full bg-btc" /> : null}
      <p className="min-w-0 flex-1 break-words leading-relaxed text-ink">{toast.text}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="flex h-6 w-6 flex-none items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-line-2 hover:text-ink"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
