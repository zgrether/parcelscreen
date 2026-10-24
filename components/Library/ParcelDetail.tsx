"use client";
/**
 * A parcel opened from the list (WF2b, docs/plans/parcel-workflow.md §5): its full name ("Add a name" when it has none),
 * Open on the map, its status and milestones, its listing's facts and notes (the explorer's own components, editable
 * here: owner, after #133), its report card (each line opening its panel, as in Compare), and Remove. A side panel on
 * desktop, a sheet on a phone.
 */
import { members } from "@/lib/client/household";
import { useCostSettings } from "@/lib/client/costRates";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ParcelNotes } from "@/components/Map/ParcelNotes";
import { ParcelStanding } from "@/components/Map/ParcelStanding";
import { withAskingPrice, withListing, withNotes } from "@/lib/client/parcelEdits";
import { CardPanel } from "@/components/Results/card/CardPanel";
import { ReportCard } from "@/components/Results/card/ReportCard";
import { Others } from "@/components/Household/Others";
import { evaluationPoint } from "@/components/Results/blocks/types";
import { parcelName } from "@/lib/client/historyRows";
import { openOnMap } from "@/lib/client/openOnMap";
import { withArchive, withMilestone, withRestore } from "@/lib/client/parcelStatus";
import type { WorkingParcel } from "@/lib/client/parcelStore";
import type { KeptScreen } from "@/lib/client/useKeptScreens";
import { loadUserConfig } from "@/lib/client/userConfig";
import { useRubricView } from "@/lib/client/useRubricView";
import { reportCard } from "@/lib/report/card";
import type { PanelKey } from "@/lib/report/cardPanels";
import { drawnOf } from "@/lib/report/marks";
import { AddedBy } from "@/components/Household/AddedBy";
import { adjustFor, useHousehold, useSeeTakes } from "@/lib/client/householdDoc";
import { listingAcresNote } from "@/lib/report/listing";

export function ParcelDetail({
  parcel,
  kept,
  change,
  remove,
  onClose,
}: {
  parcel: WorkingParcel;
  kept: KeptScreen | undefined;
  /** A change to this parcel (its status, a milestone, its listing's facts, its notes), saved by the list. */
  change(edit: (p: WorkingParcel) => WorkingParcel): void;
  remove(): void;
  onClose(): void;
}) {
  const { name, acres } = parcelName(parcel);
  const { rubrics, rubric, setRubric } = useRubricView();
  const [panel, setPanel] = useState<PanelKey | null>(null);
  const [confirming, setConfirming] = useState(false);
  useSeeTakes(parcel.key); // step 6b: open, so its takes are seen
  const config = useMemo(() => loadUserConfig(), []);
  const result = kept?.state === "ok" ? kept.result : null;
  const costs = useCostSettings();
  const household = useHousehold();
  const drawn = drawnOf(
    parcel.markup,
    parcel.drivewayLine,
    { askingPrice: parcel.askingPrice, ...costs },
    adjustFor(parcel.key, household),
  );
  const card = result ? reportCard(result, rubric, drawn) : null;
  const acresNote = listingAcresNote(parcel.listingAcres, acres);
  // The name it has until one is typed, and "Add a name": the Name box, unfolded and focused.
  const derivedName = parcelName({ ...parcel, name: "" }).name;
  const [focusName, setFocusName] = useState(0);
  const now = () => new Date().toISOString();

  return (
    <aside className="lib-detail" role="dialog" aria-label={name}>
      <header className="lib-detail-head">
        <div className="lib-detail-title">
          <h2>{name}</h2>
          {!parcel.name.trim() && (
            <button className="btn secondary small" onClick={() => setFocusName((n) => n + 1)}>
              Add a name
            </button>
          )}
        </div>
        <button className="ip-x" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="lib-detail-body">
        <p className="tiny muted">{acres !== null ? `${acres.toFixed(2)} ac` : ""}</p>
        <AddedBy addedBy={parcel.addedBy} />
        <div className="lib-detail-actions">
          <Link className="btn small" href="/explore" onClick={() => openOnMap(parcel)}>
            Open on the map
          </Link>
        </div>
        <div className="lib-standing">
          <ParcelStanding
            parcel={parcel}
            act={{
              archive: (reason) => change((p) => withArchive(p, reason, new Date().toISOString())),
              restore: () => change(withRestore),
              setMilestone: (m, date) => change((p) => withMilestone(p, m, date)),
            }}
          />
        </div>
        <div className="lib-notes">
          <ParcelNotes
            parcel={parcel}
            name={name}
            derivedName={derivedName}
            acres={acres}
            focusName={focusName}
            // The panel's title names the parcel already (owner, #133).
            nameInHeading={false}
            save={{
              notes: (text) => change((p) => withNotes(p, text, now())),
              askingPrice: (price) => change((p) => withAskingPrice(p, price, now())),
              listing: (patch) => change((p) => withListing(p, patch)),
            }}
          />
        </div>
        {card ? (
          <ReportCard
            card={card}
            result={result!}
            running={false}
            rubrics={rubrics}
            setRubric={setRubric}
            onOpen={setPanel}
            note={acresNote}
          />
        ) : (
          <p className="tiny muted">
            {kept?.state === "rescreen"
              ? "Needs grading again: open it on the map, or use the list's Grade all saved parcels again."
              : "Not graded yet: open it on the map and grade it."}
          </p>
        )}
        {/* Step 6: how each other member would rate it, from their own priorities. */}
        {result && <Others result={result} drawn={drawn} parcel={parcel.key} />}
        <div className="lib-detail-actions">
          {confirming ? (
            <>
              <span className="tiny">
                Remove it? It leaves the list and the map{members().length >= 2 ? ", for everyone" : ""}.
              </span>
              <button className="btn small danger" onClick={remove}>
                Remove
              </button>
              <button className="btn small secondary" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <button className="btn secondary small" onClick={() => setConfirming(true)}>
              Remove from the list
            </button>
          )}
        </div>
      </div>
      {panel && card && result && (
        <div className="compare-panel">
          <CardPanel
            panel={panel}
            card={card}
            result={result}
            point={evaluationPoint(result)}
            dw={config.dw}
            vetoPct={config.roadVetoGradePct}
            about={name}
            lineNames={drawn.names}
            onClose={() => setPanel(null)}
          />
        </div>
      )}
    </aside>
  );
}
