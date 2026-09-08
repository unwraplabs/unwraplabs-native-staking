"use client";

import { Reveal } from "@/components/Reveal";
import { LINKS } from "@/lib/config";

function TelegramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M21.9 4.3 18.9 19.1c-.2 1-.8 1.3-1.7.8l-4.6-3.4-2.2 2.1c-.3.3-.5.5-1 .5l.3-4.7L18.3 6c.4-.3-.1-.5-.6-.2L6.2 13.1l-4.5-1.4c-1-.3-1-1 .2-1.4l17.6-6.8c.8-.3 1.5.2 1.2 1.4l-.8-.6Z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
      <path d="m3 6.5 9 6.5 9-6.5" />
    </svg>
  );
}

export function AtSize() {
  return (
    <section className="mx-auto max-w-[1400px] px-5 md:px-10">
      <Reveal>
        <div className="flex flex-wrap items-end gap-8 border-t border-line py-12">
          <div className="min-w-[300px] flex-1">
            <h2 className="headline text-[24px]">Delegating at size?</h2>
            <p className="mt-2.5 max-w-[54ch] text-[15px] text-ink-2">
              We cover claim gas, share raw attestation telemetry, and you get the operator
              directly rather than a support form. Same commission, more access.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={LINKS.telegram}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-[4px] bg-ink px-5 py-3 text-[15px] font-medium text-white transition-colors hover:bg-neutral-800"
            >
              <TelegramIcon />
              Telegram
            </a>
            <a
              href={`mailto:${LINKS.email}?subject=Delegating%20at%20size`}
              className="flex items-center gap-2.5 rounded-[4px] border border-line px-5 py-3 text-[15px] font-medium transition-colors hover:border-ink"
            >
              <MailIcon />
              {LINKS.email}
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
