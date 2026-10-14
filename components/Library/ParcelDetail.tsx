"use client";
/**
 * A parcel opened from the list (WF2b, docs/plans/parcel-workflow.md §5): its full name, Open on the map, its status
 * and milestones (the explorer's controls), its listing facts, its report card (each line opening its panel, as in
 * Compare), and Remove. A side panel on desktop, a sheet on a phone.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { ParcelStanding } from "@/components/Map/ParcelStanding";
import { CardPanel } from "@/components/Results/card/CardPanel";
import { ReportCard } from "@/components/Results/card/ReportCard";
import { evaluationPoint } from "@/components/Results/blocks/types";
import { askingLine } from "@/lib/client/askingPrice";
import { parcelName } from "@/lib/client/historyRows";
import { safeListingHref } from "@/lib/client/listingUrl";
import { openOnMap } from "@/lib/client/openOnMap";
import { withArchive, withMilestone, withRestore, withStatus } from "@/lib/client/parcelStatus";
import type { WorkingParcel } from "@/lib/client/parcelStore";
import { getPref, setPref } from "@/lib/client/prefs";
import type { KeptScreen } from "@/lib/client/useKeptScreens";
import { loadUserConfig } from "@/lib/client/userConfig";
import { reportCard, type Person } from "@/lib/report/card";
import type { PanelKey } from "@/lib/report/cardPanels";
import { lineNamesOf } from "@/lib/report/lines";
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
  /** A change to this parcel (its status, a milestone), saved by the list. */
  change(edit: (p: WorkingParcel) => WorkingParcel): void;
  remove(): void;
  onClose(): void;
}) {
  const { name, acres } = parcelName(parcel);
  const [person, setPersonState] = useState<Person>(() => getPref("ps.person"));
  const setPerson = (p: Person) => {
    setPersonState(p);
    setPref("ps.person", p);
  };
  const [panel, setPanel] = useState<PanelKey | null>(null);
  const [confirming, setConfirming] = useState(false);
  const config = useMemo(() => loadUserConfig(), []);
  const result = kept?.state === "ok" ? kept.result : null;
  const names = lineNamesOf(parcel.markup);
  const card = result ? reportCard(result, person, names) : null;
  const href = safeListingHref(parcel.listingUrl);
  const acresNote = listingAcresNote(parcel.listingAcres, acres);
  const facts = [
    parcel.askingPrice !== null && parcel.askingPriceAt
      ? askingLine(parcel.askingPrice, parcel.askingPriceAt)
      : null,
    parcel.listingAcres !== null ? `${parcel.listingAcres} ac listed` : null,
    parcel.agent.trim() ? `Agent: ${parcel.agent.trim()}` : null,
  ].filter((x): x is string => !!x);

  return (
    <aside className="lib-detail" role="dialog" aria-label={name}>
      <header className="lib-detail-head">
        <h2>{name}</h2>
        <button className="ip-x" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="lib-detail-body">
        <p className="tiny muted">{acres !== null ? `${acres.toFixed(2)} ac` : ""}</p>
        <div className="lib-detail-actions">
          <Link className="btn small" href="/explore" onClick={() => openOnMap(parcel)}>
            Open on the map
          </Link>
          {href && (
            <a className="btn small secondary" href={href} target="_blank" rel="noopener noreferrer">
              Open listing ↗
            </a>
          )}
        </div>
        <div className="lib-standing">
          <ParcelStanding
            parcel={parcel}
            act={{
              setStatus: (st) => change((p) => withStatus(p, st)),
              archive: (reason) => change((p) => withArchive(p, reason, new Date().toISOString())),
              restore: () => change(withRestore),
              setMilestone: (m, date) => change((p) => withMilestone(p, m, date)),
            }}
          />
        </div>
        {facts.length > 0 && <p className="tiny">{facts.join(" · ")}</p>}
        {card ? (
          <ReportCard card={card} running={false} setPerson={setPerson} onOpen={setPanel} note={acresNote} />
        ) : (
          <p className="tiny muted">
            {kept?.state === "rescreen"
              ? "Screened under earlier rules: it re-screens when you open it on the map."
              : "Not screened yet: open it on the map and screen it."}
          </p>
        )}
        <div className="lib-detail-actions">
          {confirming ? (
            <>
              <span className="tiny">Remove it? It leaves your list, History and the map.</span>
              <button className="btn small danger" onClick={remove}>
                Remove
              </button>
              <button className="btn small secondary" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <button className="link-btn" onClick={() => setConfirming(true)}>
              Remove
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
            about={name}
            lineNames={names}
            onClose={() => setPanel(null)}
          />
        </div>
      )}
    </aside>
  );
}
