"use client";
/**
 * A collapsible report section in the explorer's panel (proto L1560–1562): the heading is the summary, and
 * whether it's open is kept per section in `ps.open`, under the prototype's keys and defaults. The heading's
 * "?" opens the help at the section's notes (proto L1622), without folding or unfolding the section.
 */
import { useState, type ReactNode } from "react";
import { useHelp } from "@/components/Help/HelpDialog";
import { getPref, setPref } from "@/lib/client/prefs";
import type { Heading } from "@/lib/report/parts";
import { OPEN_DEFAULT } from "../report";

const isOpen = (slug: string) => getPref("ps.open")[slug] ?? OPEN_DEFAULT[slug] ?? false;

export function Section({ heading, children }: { heading: Heading; children: ReactNode }) {
  const [open, setOpen] = useState(() => isOpen(heading.slug));
  const help = useHelp();
  return (
    <details
      className="block"
      data-key={heading.slug}
      open={open}
      onToggle={(e) => {
        const now = e.currentTarget.open;
        if (now === open) return;
        setOpen(now);
        setPref("ps.open", { ...getPref("ps.open"), [heading.slug]: now });
      }}
    >
      <summary>
        <h2>
          {heading.title}
          {heading.sub && <small>{heading.sub}</small>}
          <button
            className="help-link"
            title="What does this mean?"
            aria-label={`What does ${heading.title} mean?`}
            onClick={(e) => {
              e.preventDefault();
              help(heading.help);
            }}
          >
            ?
          </button>
        </h2>
      </summary>
      {children}
    </details>
  );
}
