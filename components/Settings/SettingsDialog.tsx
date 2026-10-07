"use client";
/**
 * The Settings dialog (step 16a; proto L340–386, L1623–1627). Opened from the ☰ menu. The prototype's four
 * sections with its labels and help text verbatim, plus the time zone (B5).
 *
 * Deviations (plan phase-0-16-settings.md §1): Save checks every field first and, on any failure, names each
 * one with its reason and stores nothing; Reset fills the form with the defaults and Save keeps them (the
 * prototype saved on Reset and left the cost fields stale); a Save with no edits writes nothing.
 * Cancel, Esc or a tap on the backdrop close without saving, as in the prototype.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_USER_CONFIG } from "@/lib/screen/config";
import type { UserConfig } from "@/lib/screen/types";
import {
  ANCHORS_LABEL,
  COST_FIELDS,
  ENDPOINTS_LABEL,
  fromForm,
  sameConfig,
  THRESHOLD_FIELDS,
  TIME_ZONE_LABEL,
  toForm,
  type FieldError,
  type NumberField,
  type SettingsForm,
} from "@/lib/client/settingsForm";

interface SettingsApi {
  /** Opens the Settings dialog. */
  open(): void;
  /** The settings in use. */
  config: UserConfig;
  /** Stores a valid config and uses it for the next run (Save, and an import's settings). */
  save(c: UserConfig): void;
}

const SettingsContext = createContext<SettingsApi>({
  open: () => {},
  config: DEFAULT_USER_CONFIG,
  save: () => {},
});

export const useSettings = (): SettingsApi => useContext(SettingsContext);

/** The browser's IANA zones, with the current one first if it isn't among them. */
function zones(current: string): string[] {
  const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return all.includes(current) ? all : [current, ...all];
}

export function SettingsProvider({
  config,
  onSave,
  children,
}: {
  config: UserConfig;
  /** A changed, valid config: store it and use it for the next run. */
  onSave(c: UserConfig): void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<SettingsForm>(() => toForm(config));
  const [errors, setErrors] = useState<FieldError[]>([]);

  const open = useCallback(() => {
    setForm(toForm(config));
    setErrors([]);
    dialog.current?.showModal();
  }, [config]);
  const close = () => dialog.current?.close();

  const save = () => {
    const r = fromForm(form, config);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    if (!sameConfig(r.config, config)) onSave(r.config);
    close();
  };

  const bad = useMemo(() => new Set(errors.map((e) => e.id)), [errors]);
  const api = useMemo(() => ({ open, config, save: onSave }), [open, config, onSave]);
  const setNumber = (id: string, v: string) => setForm((f) => ({ ...f, numbers: { ...f.numbers, [id]: v } }));
  const numberInput = (f: NumberField) => (
    <label key={f.id} className="settings-field">
      {f.label}
      <input
        type="text"
        inputMode="decimal"
        value={form.numbers[f.id] ?? ""}
        aria-invalid={bad.has(f.id) || undefined}
        onChange={(e) => setNumber(f.id, e.target.value)}
      />
    </label>
  );

  return (
    <SettingsContext.Provider value={api}>
      {children}
      <dialog
        ref={dialog}
        className="help-dialog settings-dialog"
        aria-labelledby="settings-title"
        // A click on the dialog element itself is a click on its backdrop: its content fills it.
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        <header className="help-head">
          <h2 id="settings-title">Settings</h2>
        </header>
        <div className="help-body settings-body">
          <h3>Thresholds</h3>
          <p className="tiny muted">These encode judgment, not fact. Change them and re-run.</p>
          <div className="settings-grid">{THRESHOLD_FIELDS.map(numberInput)}</div>

          <h3>Driveway unit costs</h3>
          <p className="tiny muted">
            Blue Ridge 2026 rough rates; edit to your excavator&apos;s numbers. The estimate is shown as ±30%.
          </p>
          <div className="settings-grid">{COST_FIELDS.map(numberInput)}</div>

          <h3>{ANCHORS_LABEL}</h3>
          <p className="tiny muted">
            One per line: <code>Name, lat, lon</code>
          </p>
          <textarea
            rows={6}
            aria-label={ANCHORS_LABEL}
            value={form.anchors}
            aria-invalid={bad.has("anchors") || undefined}
            onChange={(e) => setForm((f) => ({ ...f, anchors: e.target.value }))}
          />

          <h3>{ENDPOINTS_LABEL}</h3>
          <p className="tiny muted">
            Edit if a service moves. Parcel services are tried in order until one returns a feature.
          </p>
          <textarea
            rows={9}
            className="mono"
            wrap="off"
            spellCheck={false}
            aria-label={ENDPOINTS_LABEL}
            value={form.endpoints}
            aria-invalid={bad.has("endpoints") || undefined}
            onChange={(e) => setForm((f) => ({ ...f, endpoints: e.target.value }))}
          />

          <h3>{TIME_ZONE_LABEL}</h3>
          <p className="tiny muted">The night sky&apos;s hours are in this zone.</p>
          <select
            aria-label={TIME_ZONE_LABEL}
            value={form.timeZone}
            aria-invalid={bad.has("timeZone") || undefined}
            onChange={(e) => setForm((f) => ({ ...f, timeZone: e.target.value }))}
          >
            {zones(form.timeZone).map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <footer className="settings-foot">
          {errors.length > 0 && (
            <div className="settings-errors" role="alert">
              <b>Not saved. Fix these first:</b>
              <ul>
                {errors.map((e, i) => (
                  <li key={i}>
                    {e.label} — {e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="settings-buttons">
            <button
              className="btn secondary"
              onClick={() => {
                setForm(toForm(DEFAULT_USER_CONFIG));
                setErrors([]);
              }}
            >
              Reset to defaults
            </button>
            <span className="grow" />
            <button className="btn secondary" onClick={close}>
              Cancel
            </button>
            <button className="btn" onClick={save}>
              Save
            </button>
          </div>
        </footer>
      </dialog>
    </SettingsContext.Provider>
  );
}
