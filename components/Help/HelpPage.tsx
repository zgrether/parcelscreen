"use client";
/**
 * Help (step 4b, docs/plans/step-4b-navigation.md §6): one page, in two sections.
 * 1. "Reading a parcel's report": the help dialog's notes (HelpText), with their anchors (h-verdict, h-sun, …).
 * 2. "How grades work": the rulebook (VR7), with its anchors (rule-<panel>), which each report panel's "How it's
 *    scored" links to. The old /rulebook redirects here, keeping its #rule-<panel> (next.config.ts).
 * A report section's "?" still opens its notes in the dialog, over the parcel; the dialog links here ("All of Help").
 */
import { Rulebook } from "@/components/Rulebook/Rulebook";
import { GRADES_ID, GRADES_TITLE, HELP_TITLE, READING_ID, READING_TITLE } from "@/lib/client/help";
import { HelpText } from "./HelpText";

export function HelpPage() {
  return (
    <main className="compare help-page">
      <header className="compare-head">
        <h1>{HELP_TITLE}</h1>
      </header>
      <nav className="help-toc" aria-label="On this page">
        <a className="link-btn" href={`#${READING_ID}`}>
          {READING_TITLE}
        </a>
        <a className="link-btn" href={`#${GRADES_ID}`}>
          {GRADES_TITLE}
        </a>
      </nav>
      <section id={READING_ID} className="help-section" aria-labelledby={`${READING_ID}-title`}>
        <h2 id={`${READING_ID}-title`} className="help-section-title">
          {READING_TITLE}
        </h2>
        <div className="help-body">
          <HelpText />
        </div>
      </section>
      <section id={GRADES_ID} className="help-section" aria-labelledby={`${GRADES_ID}-title`}>
        <h2 id={`${GRADES_ID}-title`} className="help-section-title">
          {GRADES_TITLE}
        </h2>
        <Rulebook />
      </section>
    </main>
  );
}
