"use client";
/**
 * The parcel's ⋯ (step 9 plan §5; UX part 2 PR 3, the audit's P-2), at the end of the header's actions:
 *   - Make a report, which opens the parcel's print page. Enabled once the parcel is graded and on the list; before
 *     that it says "Grade it first".
 *   - Copy summary, once it's graded (it was a button at the panel's foot).
 *   - Remove from Your list, on a kept parcel, asking first as the star does.
 *   - Save offline (step 14e): the parcel and the map around it kept on this device; Update offline copy once saved.
 * A small menu, as a row's ⋯ on Your list.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { unstarQuestion } from "@/components/Favorites/Star";
import { ResetConfirm } from "@/components/Rubric/ResetConfirm";
import { SaveOfflineItem, SaveOfflineSheet } from "@/components/Offline/SaveOffline";
import type { SaveTarget } from "@/lib/client/saveOffline";
import { REPORT_WORDS, reportHref } from "@/lib/print/report";

export const MENU_WORDS = { copy: "Copy summary", remove: "Remove from Your list", keep: "Keep" };

export function PanelMenu({
  parcelKey,
  graded,
  copySummary,
  remove,
  saveTarget,
}: {
  parcelKey: string | null;
  graded: boolean;
  /** Null until there's a grade to copy. */
  copySummary: (() => void) | null;
  /** Null for a parcel not on the list; `adder` names whose Recent it goes back to. */
  remove: { adder: string | null; run(): void } | null;
  /** Save offline's parcel, built when the menu opens; null for one with no boundary yet. */
  saveTarget: () => SaveTarget | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const ready = graded && parcelKey !== null;
  const target = open ? saveTarget() : null;
  return (
    <span
      ref={box}
      className="sh-more"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          // Handled: the explorer's Esc (which closes the parcel) skips it (the UX audit's B-4). React listens on the
          // document too, so stopping the event alone doesn't reach a listener there.
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="sh-more-btn sh-act"
        aria-label="More for this parcel"
        title={REPORT_WORDS.make}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open && (
        <span className="lib-menu sh-more-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            disabled={!ready}
            title={ready ? undefined : REPORT_WORDS.gradeFirst}
            onClick={() => {
              setOpen(false);
              router.push(reportHref(parcelKey!));
            }}
          >
            {REPORT_WORDS.make}
          </button>
          {!ready && <span className="tiny muted sh-more-why">{REPORT_WORDS.gradeFirst}</span>}
          {copySummary && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                copySummary();
              }}
            >
              {MENU_WORDS.copy}
            </button>
          )}
          {target && <SaveOfflineItem target={target} close={() => setOpen(false)} />}
          {remove && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setConfirming(true);
              }}
            >
              {MENU_WORDS.remove}
            </button>
          )}
        </span>
      )}
      <SaveOfflineSheet />
      {confirming &&
        remove &&
        createPortal(
          <ResetConfirm
            question={unstarQuestion(remove.adder)}
            action={MENU_WORDS.remove}
            keep={MENU_WORDS.keep}
            reset={() => {
              remove.run();
              setConfirming(false);
            }}
            cancel={() => setConfirming(false)}
          />,
          document.body,
        )}
    </span>
  );
}
