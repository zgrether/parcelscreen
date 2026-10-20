"use client";
/**
 * The first run's other way in (after step 6: Zach's phone was named at its first run and joined as a second person):
 * "I already use Parcel Screen on another device" opens Join with a code, so the device joins the person's synced space
 * instead of starting as someone new. The code goes to /link's join question, as a scanned QR does; joining replaces
 * this device's untouched first profile with the space's, and Who's this? then picks the person.
 */
import { useState } from "react";
import { groupCode, normalizeCode } from "@/lib/sync/code";
import { ALREADY_USE, JOIN_FIRST_LINE, WRONG_CODE } from "@/lib/sync/words";

const PLACEHOLDER = "XXXXXXXXXXXXXXXXXXXXXXXXXX";

export function JoinFirst() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState(false);
  if (!open)
    return (
      <button type="button" className="btn secondary join-first" onClick={() => setOpen(true)}>
        {ALREADY_USE}
      </button>
    );
  return (
    <form
      className="sync-block join-first"
      aria-label={ALREADY_USE}
      onSubmit={(e) => {
        e.preventDefault();
        const code = normalizeCode(typed);
        // A full load, as a scanned QR's: /link reads the code from the fragment and clears it from the address bar.
        if (code) location.assign(new URL(`/link#${code}`, location.origin).href);
        else setError(true);
      }}
    >
      <p className="sync-line">{JOIN_FIRST_LINE}</p>
      <label className="sync-field">
        The code from your other device
        <input
          className="sync-code-input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={groupCode(PLACEHOLDER)}
          aria-invalid={error || undefined}
        />
      </label>
      {error && (
        <p className="sync-line bad" role="alert">
          {WRONG_CODE}
        </p>
      )}
      <div className="sync-buttons">
        <button className="btn" type="submit">
          Join
        </button>
        <button className="btn secondary" type="button" onClick={() => setOpen(false)}>
          Back
        </button>
      </div>
    </form>
  );
}
