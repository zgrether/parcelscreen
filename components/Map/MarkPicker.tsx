"use client";
/**
 * The Mark picker (owner, after #136): everything that can be marked on a parcel, as icons in four groups (Build, Ways
 * in, Water & utilities, On the land), with the last three used above them. A bottom sheet on a phone, a popover on a
 * desktop: above the toolbar from + Mark, or beside the point a right-click opened it at. Picking a kind starts its
 * tool; opened from the map, the mark (or a line's first point) goes where it was opened.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import { CHOICE_GROUPS, CHOICE_LABEL, type MarkChoice } from "@/lib/client/markChoices";
import { useExplore } from "@/components/Explore/useExploreController";
import { MarkIcon } from "./markIcons";

export function MarkPicker() {
  const ctl = useExplore();
  const p = ctl.picker;
  const box = useRef<HTMLDivElement>(null);
  const open = !!p;
  const close = useRef(ctl.closePicker);
  useEffect(() => {
    close.current = ctl.closePicker;
  });
  useEffect(() => {
    if (!open) return;
    // The first choice takes the focus, for the keyboard; Esc closes.
    box.current?.querySelector<HTMLButtonElement>(".mark-choice")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      close.current();
    };
    // Captured first, and marked handled, so the Info panel's own Esc (close) doesn't act on the same press.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);
  if (!p) return null;
  const style = p.point ? ({ "--x": `${p.point.x}px`, "--y": `${p.point.y}px` } as CSSProperties) : undefined;
  return (
    <>
      {/* Closed by a press of its own, not a click: the click a long press ends with lands here and isn't one. */}
      <div className="mark-backdrop" onPointerDown={ctl.closePicker} />
      <div
        ref={box}
        className={p.point ? "mark-picker at-point" : "mark-picker"}
        role="dialog"
        aria-label="Mark on the parcel"
        style={style}
      >
        <div className="mark-picker-head">
          <h2>{p.at ? "Mark here" : "Mark"}</h2>
          <button className="mark-close" aria-label="Close" onClick={ctl.closePicker}>
            ×
          </button>
        </div>
        {ctl.recentMarks.length > 0 && <Group title="Recent" choices={ctl.recentMarks} pick={ctl.pickMark} />}
        {CHOICE_GROUPS.map((g) => (
          <Group key={g.title} title={g.title} choices={g.choices} pick={ctl.pickMark} />
        ))}
      </div>
    </>
  );
}

function Group({
  title,
  choices,
  pick,
}: {
  title: string;
  choices: readonly MarkChoice[];
  pick(c: MarkChoice): void;
}) {
  return (
    <section className="mark-group" role="group" aria-label={title}>
      <h3>{title}</h3>
      <div className="mark-grid">
        {choices.map((c) => (
          <button key={c} className="mark-choice" onClick={() => pick(c)}>
            <MarkIcon kind={c} px={36} />
            <span>{CHOICE_LABEL[c]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
