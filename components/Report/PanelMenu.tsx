"use client";
/**
 * The parcel panel header's ⋯ (step 9 plan §5): Report card, which opens the parcel's print page. Enabled once the
 * parcel is graded and on the list; before that it says "Grade it first". A small menu, as a row's ⋯ on Your list.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { REPORT_WORDS, reportHref } from "@/lib/print/report";

export function PanelMenu({ parcelKey, graded }: { parcelKey: string | null; graded: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
        className="sh-more-btn"
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
        </span>
      )}
    </span>
  );
}
