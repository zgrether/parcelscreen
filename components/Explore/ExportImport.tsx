"use client";
/**
 * Export file / Import file, under History in the ☰ menu (step 16b; proto L1603–1612). The file and the
 * import plan are lib/client/exportFile.ts; this reads and writes storage around them.
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
import { getPref } from "@/lib/client/prefs";
import { currentProfile, FIRST_PROFILE_NAME } from "@/lib/client/profiles";
import { effectiveRubrics, setProfileRubrics } from "@/lib/client/rubrics";
import { getScreens, putScreens } from "@/lib/client/screenStore";
import type { ProfileRubrics } from "@/lib/rubric/schema";
import { useSettings } from "@/components/Settings/SettingsDialog";
import { useExplore } from "./useExploreController";

interface Summary {
  ok: boolean;
  lines: string[];
  /** A version 6 file's rubrics, offered by the tick; what the profile had, for unticking. */
  rubrics?: { file: ProfileRubrics; before: ProfileRubrics | null; on: boolean };
}

export function ExportImport() {
  const ctl = useExplore();
  const settings = useSettings();
  const input = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const exportFile = async () => {
    const now = new Date().toISOString();
    const { store } = ctl.state;
    const screens = await getScreens(keptScreenIds(store));
    const from = {
      profile: { name: currentProfile()?.name ?? FIRST_PROFILE_NAME },
      rubrics: effectiveRubrics(),
    };
    const blob = new Blob(
      [JSON.stringify(buildExport(settings.config, store, screens, now, from), null, 1)],
      {
        type: "application/json",
      },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = exportFileName(now);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  const importFile = async (file: File) => {
    const r = planImport(
      await file.text(),
      { store: ctl.state.store, cfg: settings.config },
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
    if (plan.added.length) ctl.importParcels(plan.added);
    if (outcome === "replaced") settings.save(plan.settings!.config);
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
    <section className="block menu-file">
      <div className="row">
        <button className="btn secondary small" onClick={() => void exportFile()}>
          Export file
        </button>
        <button className="btn secondary small" onClick={() => input.current?.click()}>
          Import file
        </button>
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
