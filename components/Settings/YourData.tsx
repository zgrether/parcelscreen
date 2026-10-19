"use client";
/**
 * Settings' "Your data" (step 4b, plan §7): Export file and Import file, which were under History in the ☰ menu (step
 * 16b; proto L1603–1612). They act at once, outside the form's Save and Cancel. The file and the import plan are
 * lib/client/exportFile.ts; this reads and writes storage around them, through the explorer while it's mounted
 * (lib/client/liveParcels.ts).
 *
 * Import applies all of the file or none of it: the plan is checked whole first; the settings question comes
 * before anything is written; the screens are kept in one transaction before the parcels are added. The export
 * carries the current profile's name and rubrics (version 6, step 1); on import the file's rubrics replace the
 * profile's only through the summary's "Replace my rubric too" tick, off by default.
 */
import { useRef, useState } from "react";
import {
  buildExport,
  exportFileName,
  importSummary,
  keptScreenIds,
  NOT_AN_EXPORT,
  planImport,
  settingsQuestion,
  type SettingsOutcome,
} from "@/lib/client/exportFile";
import { addImportedParcels, currentParcels } from "@/lib/client/liveParcels";
import { getPref } from "@/lib/client/prefs";
import { currentProfile, FIRST_PROFILE_NAME } from "@/lib/client/profiles";
import { effectiveRubrics, setProfileRubrics } from "@/lib/client/rubrics";
import { getScreens, putScreens } from "@/lib/client/screenStore";
import type { ProfileRubrics } from "@/lib/rubric/schema";
import type { UserConfig } from "@/lib/screen/types";
import { SyncSection } from "@/components/Sync/SyncSection";

export const YOUR_DATA = "Your data";
export const YOUR_DATA_NOTE = "These don't wait for Save.";
export const EXPORT_LINE =
  "Save every parcel in this profile to a file: a backup, or to move them to another browser.";
export const IMPORT_LINE = "Add the parcels from an export file to this profile.";

/** Export file: the current profile's parcels, their screens and the settings, downloaded (also the join's "Export first"). */
export async function downloadExport(config: UserConfig): Promise<void> {
  const now = new Date().toISOString();
  const store = currentParcels();
  const screens = await getScreens(keptScreenIds(store));
  const from = {
    profile: { name: currentProfile()?.name ?? FIRST_PROFILE_NAME },
    rubrics: effectiveRubrics(),
  };
  const blob = new Blob([JSON.stringify(buildExport(config, store, screens, now, from), null, 1)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = exportFileName(now);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

interface Summary {
  ok: boolean;
  lines: string[];
  /** A version 6 file's rubrics, offered by the tick; what the profile had, for unticking. */
  rubrics?: { file: ProfileRubrics; before: ProfileRubrics | null; on: boolean };
}

export function YourData({
  config,
  save,
}: {
  /** The settings in use: exported with the parcels, and compared with a file's. */
  config: UserConfig;
  /** An import whose settings the person chose to take. */
  save(c: UserConfig): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const exportFile = () => downloadExport(config);

  const importFile = async (file: File) => {
    const r = planImport(
      await file.text(),
      { store: currentParcels(), cfg: config },
      new Date().toISOString(),
      () => crypto.randomUUID(),
    );
    if (!r.ok) {
      setSummary({
        ok: false,
        lines:
          r.errors[0] === NOT_AN_EXPORT
            ? [NOT_AN_EXPORT]
            : ["Nothing imported. The file has problems:", ...r.errors],
      });
      return;
    }
    const plan = r.plan;
    const outcome: SettingsOutcome =
      plan.settings === null
        ? "none"
        : plan.settings.changed.length === 0
          ? "unchanged"
          : window.confirm(settingsQuestion(plan.settings))
            ? "replaced"
            : "declined";
    if (!(await putScreens(plan.screens))) {
      setSummary({ ok: false, lines: ["Nothing imported: this browser couldn't keep the file's results."] });
      return;
    }
    addImportedParcels(plan.added);
    if (outcome === "replaced") save(plan.settings!.config);
    setSummary({
      ok: true,
      lines: importSummary(plan, outcome),
      ...(plan.rubrics ? { rubrics: { file: plan.rubrics, before: getPref("ps.rubrics"), on: false } } : {}),
    });
  };
  /** The tick: the file's rubrics replace the profile's; unticked, what the profile had comes back. */
  const tickRubrics = (on: boolean) => {
    if (!summary?.rubrics) return;
    setProfileRubrics(on ? summary.rubrics.file : summary.rubrics.before);
    setSummary({ ...summary, rubrics: { ...summary.rubrics, on } });
  };

  return (
    <section className="your-data" aria-labelledby="your-data-title">
      <h3 id="your-data-title">{YOUR_DATA}</h3>
      <p className="tiny muted">{YOUR_DATA_NOTE}</p>
      <div className="your-data-row">
        <button className="btn secondary" onClick={() => void exportFile()}>
          Export file
        </button>
        <span className="tiny muted">{EXPORT_LINE}</span>
      </div>
      <div className="your-data-row">
        <button className="btn secondary" onClick={() => input.current?.click()}>
          Import file
        </button>
        <span className="tiny muted">{IMPORT_LINE}</span>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="Import file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void importFile(f);
          }}
        />
      </div>
      {/* Step 5: this device's data synced with your others, by a code. */}
      <SyncSection />
      {summary && (
        <ul className={`import-summary tiny${summary.ok ? "" : " bad"}`} role="status">
          {summary.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
          {summary.rubrics && (
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={summary.rubrics.on}
                  onChange={(e) => tickRubrics(e.target.checked)}
                />{" "}
                Replace my rubric too
              </label>
              {summary.rubrics.on && " Your rubric is now the file's."}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
