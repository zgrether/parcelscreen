"use client";
/**
 * Developer diagnostic for step 11: runs the real screen in the Web Worker on a square around a point and
 * shows the step list and summary. It exists so the worker is bundled (and testable in a browser) before
 * the explorer UI lands; step 14 removes it. Running it calls the live public services.
 */
import { useState } from "react";
import { squareAround } from "@/lib/geo/parcels";
import { useScreen } from "@/lib/client/useScreen";
import { DEFAULT_USER_CONFIG, STEPS } from "@/lib/screen/config";
import { summaryText } from "@/lib/screen/summary";
import type { ScreenResult } from "@/lib/screen/types";

export default function DevScreenPage() {
  const { state, run, cancel, ping } = useScreen();
  const [lat, setLat] = useState("36.8874");
  const [lon, setLon] = useState("-80.45455");
  const [acres, setAcres] = useState("5");

  const start = () => {
    const polygon = squareAround([+lat, +lon], +acres).geometry;
    run({ polygon, config: DEFAULT_USER_CONFIG });
  };

  return (
    <main className="mx-auto max-w-3xl p-6 text-sm">
      <h1 className="font-cond text-[22px] font-semibold">Screen worker (developer diagnostic)</h1>
      <p className="text-ink-2">
        Runs the full screen in a Web Worker on a square around a point. Calls the live services.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        {[
          ["Lat", lat, setLat],
          ["Lon", lon, setLon],
          ["Acres", acres, setAcres],
        ].map(([label, value, set]) => (
          <label key={label as string} className="text-ink-2 text-xs">
            {label as string}
            <input
              className="border-rule mt-1 block w-32 rounded border bg-white px-2 py-1"
              value={value as string}
              onChange={(e) => (set as (v: string) => void)(e.target.value)}
            />
          </label>
        ))}
        <button
          className="bg-ink text-paper rounded px-3 py-1.5"
          onClick={start}
          disabled={state.status === "running"}
        >
          Run
        </button>
        <button className="border-ink-2 rounded border px-3 py-1.5" onClick={ping}>
          Check worker
        </button>
        <span data-testid="worker-ready" className="text-ink-2 text-xs">
          {state.workerReady ? "worker ready" : "worker not checked"}
        </span>
        {state.status === "running" && (
          <button className="border-ink-2 rounded border px-3 py-1.5" onClick={cancel}>
            Cancel
          </button>
        )}
      </div>
      <ul className="mt-4 space-y-0.5">
        {STEPS.map(([id, label]) => {
          const st = state.steps[id];
          return (
            <li
              key={id}
              className={st?.status === "fail" ? "text-steep" : st?.status === "done" ? "" : "text-ink-2"}
            >
              {st?.status ?? "·"} — {label}
              {st?.message ? ` — ${st.message}` : ""}
            </li>
          );
        })}
      </ul>
      {state.error && <p className="text-steep mt-4">{state.error}</p>}
      {state.status === "done" && state.result && (
        <pre className="border-rule mt-4 overflow-auto rounded border bg-white p-3 text-xs whitespace-pre-wrap">
          {summaryText(state.result as ScreenResult)}
        </pre>
      )}
    </main>
  );
}
