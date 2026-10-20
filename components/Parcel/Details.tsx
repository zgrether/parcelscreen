"use client";
/**
 * The parcel panel's Details (step 8b, docs/plans/step-8b-parcel-panel.md §3): everything about the open parcel, under
 * the Grade | Details switch. A top line (who added it, and whether it's archived), then Listing, Notes, Lines & marks,
 * Boundary and Status (Archive, Walked, Offered), and Remove this parcel at the end. It was the Info panel's Layers
 * tree, details and Notes tab.
 *
 * Keys, with no field focused and no tool in use: Delete or Backspace deletes the open row's item; Esc closes the row
 * (the next Esc is the map's: it closes the parcel).
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AddedBy } from "@/components/Household/AddedBy";
import { findLayer, type LayerId, type LayerNode } from "@/components/Explore/layers";
import type { ExploreController } from "@/components/Explore/useExploreController";
import { ListingFacts } from "@/components/Map/ListingFacts";
import { ParcelNotes } from "@/components/Map/ParcelNotes";
import { ParcelStanding } from "@/components/Map/ParcelStanding";
import { parcelDisplayName } from "@/lib/client/historyRows";
import { members } from "@/lib/client/household";
import { mapShowing } from "@/lib/client/mapShowing";
import { isBuilt } from "@/lib/client/parcelStore";
import { statusLine } from "@/lib/client/parcelStatus";
import { Boundary } from "./Boundary";
import { LinesMarks } from "./LinesMarks";
import { Btn } from "./MarkupDetails";
import { SHOW_BOUNDARY, takeBoundary } from "./ParcelSwitch";

export function Details({ ctl }: { ctl: ExploreController }) {
  const root = ctl.layers;
  const open = ctl.state.store.open;
  if (!open || !root) return null;
  // Keyed by the open parcel: a pending confirm, an error or a half-typed note never carries over to another.
  return <Body key={ctl.state.serial} ctl={ctl} root={root} />;
}

function Body({ ctl, root }: { ctl: ExploreController; root: LayerNode }) {
  const open = ctl.state.store.open!;
  const serial = ctl.state.serial;
  const [error, setError] = useState<string | null>(null);
  const remove = (id: LayerId) => setError(ctl.deleteLayer(id));
  useDetailsKeys(ctl, root, remove);
  useBoundaryScroll();
  // A hovered row's line stops glowing when Details goes.
  const { setHoverLine } = ctl;
  useEffect(() => () => setHoverLine(null), [setHoverLine]);
  const name = root.name;
  const derivedName = ctl.derived ? parcelDisplayName(ctl.derived) : name;
  const acres = ctl.derived?.ok ? ctl.derived.acres : null;
  const save = {
    notes: (text: string) => ctl.saveNotes(text, serial),
    askingPrice: (price: number | null) => ctl.saveAskingPrice(price, serial),
    listing: (patch: Parameters<ExploreController["saveListing"]>[0]) => ctl.saveListing(patch, serial),
  };
  return (
    <div className="parcel-details">
      {/* Who added it, and that it's archived if it is; Archive and the milestones are in Status, near the end (the
          fresh-eyes review: a rare action shouldn't lead). */}
      <div className="pd-top">
        <AddedBy addedBy={open.addedBy} />
        {open.status === "archived" && <p className="ip-note">{statusLine(open)}</p>}
      </div>
      {error && <p className="ip-error">{error}</p>}
      <Section title="Listing">
        <ListingFacts parcel={open} derivedName={derivedName} acres={acres} save={save} />
      </Section>
      <Section title="Notes">
        <ParcelNotes
          parcel={open}
          name={name}
          derivedName={derivedName}
          acres={acres}
          save={save}
          listing={false}
        />
      </Section>
      <Section
        title="Lines & marks"
        actions={
          <>
            <Btn onClick={() => ctl.pickMark("track")}>Draw a line</Btn>
            <Btn onClick={() => ctl.openPicker()}>+ Mark</Btn>
          </>
        }
      >
        <LinesMarks ctl={ctl} root={root} remove={remove} />
      </Section>
      <Section title="Boundary" boundary>
        <Boundary ctl={ctl} root={root} remove={remove} />
      </Section>
      <Section title="Status">
        <ParcelStanding
          parcel={open}
          act={{
            archive: (reason) => ctl.archive(reason, serial),
            restore: () => ctl.restore(serial),
            setMilestone: (m, date) => ctl.setMilestone(m, date, serial),
          }}
        />
      </Section>
      {isBuilt(open) && open.key && <RemoveParcel ctl={ctl} parcelKey={open.key} />}
    </div>
  );
}

function Section({
  title,
  actions,
  children,
  boundary = false,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  /** The section the toolbar's acres brings into view. */
  boundary?: boolean;
}) {
  const id = useId();
  return (
    <section className="pd-sec" aria-labelledby={id} data-boundary={boundary || undefined}>
      <div className="pd-sec-head">
        <h3 id={id}>{title}</h3>
        {actions && <span className="pd-actions">{actions}</span>}
      </div>
      {children}
    </section>
  );
}

/** Remove this parcel, with today's inline confirm (it leaves the list and the map, for everyone). */
function RemoveParcel({ ctl, parcelKey }: { ctl: ExploreController; parcelKey: string }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="pd-sec pd-actions">
      {confirming ? (
        <>
          <span className="ip-ask">
            Remove it? It leaves the list and the map{members().length >= 2 ? ", for everyone" : ""}.
          </span>
          <Btn kind="danger" onClick={() => ctl.removeSaved(parcelKey)}>
            Remove
          </Btn>
          <Btn onClick={() => setConfirming(false)}>Keep</Btn>
        </>
      ) : (
        <Btn kind="danger" onClick={() => setConfirming(true)}>
          Remove this parcel…
        </Btn>
      )}
    </div>
  );
}

/** Delete or Backspace deletes the open row's item; Esc closes the row. Captured first, so the map's Esc waits. */
function useDetailsKeys(ctl: ExploreController, root: LayerNode, remove: (id: LayerId) => void) {
  const keys = useRef({ ctl, root, remove });
  useEffect(() => {
    keys.current = { ctl, root, remove };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      const s = k.ctl.current();
      if (e.defaultPrevented || s.mode || s.split || !s.layer || !mapShowing()) return;
      if ((e.target as HTMLElement | null)?.closest("input,select,textarea,[contenteditable]")) return;
      if (document.querySelector(".mark-picker, .rubric-sheet-scrim")) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!findLayer(k.root, s.layer)?.deletable) return;
        e.preventDefault();
        k.remove(s.layer);
      } else if (e.key === "Escape") {
        e.preventDefault();
        k.ctl.selectLayer(null);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);
}

/** Boundary scrolled into view when the toolbar's acres asks (as Details opens, or while it shows). */
function useBoundaryScroll() {
  useEffect(() => {
    const go = () => {
      if (takeBoundary())
        document.querySelector<HTMLElement>(".pd-sec[data-boundary]")?.scrollIntoView?.({ block: "start" });
    };
    go();
    window.addEventListener(SHOW_BOUNDARY, go);
    return () => window.removeEventListener(SHOW_BOUNDARY, go);
  }, []);
}
