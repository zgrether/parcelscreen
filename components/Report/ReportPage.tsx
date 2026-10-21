"use client";
/**
 * The report card export (step 9, docs/plans/step-9-report-export.md §1): /parcel/<key>/report, a print-ready page from
 * the parcel's saved screen alone. Its own top bar (Back, One page | Full, Print or save as PDF) doesn't print; the
 * sheet under it is laid out at Letter size on screen too, so what you see is what prints.
 */
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getPref, setPref } from "@/lib/client/prefs";
import { useHousehold } from "@/lib/client/householdDoc";
import { parcelName } from "@/lib/client/historyRows";
import { recipeOf, type WorkingParcel } from "@/lib/client/parcelStore";
import { currentProfile } from "@/lib/client/profiles";
import { memberName } from "@/lib/client/household";
import { profileRubrics, viewedRubric } from "@/lib/client/rubrics";
import { needsRescreen, readScreen, type ScreenRecord } from "@/lib/client/screenStore";
import { runKeys } from "@/lib/client/screenKeys";
import { OLD_DATA_DROPPED } from "@/lib/client/oldData";
import { deriveParcel } from "@/lib/geo/recipe";
import { drawnOf } from "@/lib/report/marks";
import { DEFAULT_USER_CONFIG, SCREEN_CONSTANTS } from "@/lib/screen/config";
import { MINE } from "@/lib/rubric/types";
import { presetOf, REPORT_WORDS as W, reportContent, type Preset } from "@/lib/print/report";
import { OnePage } from "./OnePage";

type Loaded =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "ungraded"; parcel: WorkingParcel }
  | { kind: "older"; parcel: WorkingParcel }
  | { kind: "ok"; parcel: WorkingParcel; record: ScreenRecord };

/** The parcel's key from the URL: the page's own path, so the offline shell (§1) reads it too. */
function keyFromPath(): string | null {
  const m = /^\/parcel\/([^/]+)\/report\/?$/.exec(window.location.pathname);
  return m ? decodeURIComponent(m[1]!) : null;
}

export function ReportPage() {
  const router = useRouter();
  // The parcel is read at once from the store; only its saved screen waits for IndexedDB (or the synced space).
  const [parcel] = useState(() => {
    const key = keyFromPath();
    return getPref("ps.parcels")?.built.find((b) => b.key === key) ?? null;
  });
  const [loaded, setLoaded] = useState<Loaded>(() =>
    !parcel
      ? { kind: "missing" }
      : !parcel.screenIds.length
        ? { kind: "ungraded", parcel }
        : { kind: "loading" },
  );
  const [preset, setPresetState] = useState<Preset>(
    () => presetOf(new URLSearchParams(window.location.search).get("preset")) ?? getPref("ps.reportPreset"),
  );
  const setPreset = (p: Preset) => {
    setPresetState(p);
    setPref("ps.reportPreset", p);
    const url = new URL(window.location.href);
    url.searchParams.set("preset", p === "full" ? "full" : "one");
    window.history.replaceState(window.history.state, "", url);
  };

  useEffect(() => {
    const id = parcel?.screenIds.at(-1);
    if (!parcel || !id) return;
    let alive = true;
    void readScreen(id).then((r) => {
      if (!alive) return;
      if (r.kind !== "ok") setLoaded({ kind: "ungraded", parcel });
      else if (needsRescreen(r)) setLoaded({ kind: "older", parcel });
      else setLoaded({ kind: "ok", parcel, record: r.record });
    });
    return () => {
      alive = false;
    };
  }, [parcel]);

  const back = () => (window.history.length > 1 ? router.back() : router.push("/library"));

  return (
    <main className="report-page">
      <div className="rp-bar">
        <button type="button" className="btn secondary rp-back" onClick={back}>
          {W.back}
        </button>
        {loaded.kind === "ok" && (
          <>
            <div className="list-switch rp-switch" role="tablist" aria-label="Report card length">
              {(["one", "full"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  className="list-switch-seg"
                  aria-selected={preset === p}
                  onClick={() => setPreset(p)}
                >
                  {p === "one" ? W.onePage : W.full}
                </button>
              ))}
            </div>
            <button type="button" className="btn rp-print" onClick={() => window.print()}>
              {W.print}
            </button>
          </>
        )}
      </div>
      {loaded.kind === "loading" && <p className="rp-state muted">{W.loading}</p>}
      {loaded.kind === "missing" && <p className="rp-state">{W.notHere}</p>}
      {loaded.kind === "ungraded" && <p className="rp-state">{W.notGraded}</p>}
      {loaded.kind === "older" && <p className="rp-state">{OLD_DATA_DROPPED}</p>}
      {loaded.kind === "ok" && <Report parcel={loaded.parcel} record={loaded.record} preset={preset} />}
    </main>
  );
}

function Report({ parcel, record, preset }: { parcel: WorkingParcel; record: ScreenRecord; preset: Preset }) {
  const household = useHousehold();
  const content = useMemo(() => {
    const derived = deriveParcel(recipeOf(parcel), SCREEN_CONSTANTS.combine);
    // A boundary changed since the run (the panel's "earlier boundary"): the saved screen still prints, and says so.
    const stale =
      derived.ok &&
      runKeys(derived.record.geo.geometry, null, DEFAULT_USER_CONFIG).boundary !== record.keys.boundary;
    const rubrics = profileRubrics();
    const me = currentProfile()?.name ?? "You";
    const { name, acres } = parcelName(parcel);
    return reportContent({
      name,
      acres,
      askingPrice: parcel.askingPrice,
      askingPriceAt: parcel.askingPriceAt,
      result: record.result,
      drawn: drawnOf(parcel.markup, parcel.drivewayLine),
      rubrics,
      viewer: viewedRubric(rubrics),
      nameOf: (id) =>
        id === MINE || id === currentProfile()?.id
          ? me
          : (memberName(id) ?? rubrics.find((r) => r.id === id)?.name ?? "?"),
      household,
      parcelKey: parcel.key!,
      stale,
    });
  }, [parcel, record, household]);
  return (
    <SheetScale>
      <article className="rp-sheet" data-preset={preset} aria-label={`${W.title}: ${content.name}`}>
        <OnePage content={content} fit={preset === "one"} />
      </article>
    </SheetScale>
  );
}

/** The sheet's width on screen: Letter, 8.5 in at 96 px per inch. */
const SHEET_PX = 816;

/**
 * A screen narrower than the sheet (a phone) shows it scaled down to fit, with the sheet still laid out at Letter width,
 * so its layout and One page's fit are the print's. Print undoes the scale (CSS).
 */
function SheetScale({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 32) / SHEET_PX));
    fit();
    window.addEventListener("resize", fit);
    const ro = new ResizeObserver(() => setHeight(inner.current?.offsetHeight ?? null));
    if (inner.current) ro.observe(inner.current);
    return () => {
      window.removeEventListener("resize", fit);
      ro.disconnect();
    };
  }, []);
  const scaled = scale < 1;
  return (
    <div
      className="rp-wrap"
      style={
        scaled ? { width: SHEET_PX * scale, height: height !== null ? height * scale : undefined } : undefined
      }
    >
      <div
        ref={inner}
        className="rp-scaled"
        style={
          scaled ? { transform: `scale(${scale})`, transformOrigin: "top left", width: SHEET_PX } : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
