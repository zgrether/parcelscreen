"use client";
/**
 * A collapsible report section in the explorer's panel (proto L1560–1562): the heading is the summary, and
 * whether it's open is kept per section in `ps.open`, under the prototype's keys and defaults.
 */
import { useState, type ReactNode } from "react";
import { getPref, setPref } from "@/lib/client/prefs";
import type { Heading } from "@/lib/report/parts";
import { OPEN_DEFAULT } from "../report";

const isOpen = (slug: string) => getPref("ps.open")[slug] ?? OPEN_DEFAULT[slug] ?? false;

export function Section({ heading, children }: { heading: Heading; children: ReactNode }) {
  const [open, setOpen] = useState(() => isOpen(heading.slug));
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
        </h2>
      </summary>
      {children}
    </details>
  );
}
