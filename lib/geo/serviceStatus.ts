/**
 * When a state's parcel service doesn't answer (owner, after 16b: VGIN returned HTTP 500 for hours on
 * 2026-10-07 and the explorer said nothing). The lines, a tap and the parcel-number search all say so in
 * these words, naming the state.
 *
 * Parcel requests also get the flood step's timeout rule (follow-up 22): one retry after a timeout, with a
 * longer limit. An HTTP error or a refused request isn't retried; moving the map asks again.
 */
import { STATE_BY_HOST } from "./recipe";

/** Per attempt (the client's default), and the one longer retry after a timeout. */
export const PARCEL_SERVICE_TIMEOUTS = { timeoutMs: 30_000, retryTimeoutMs: 45_000 } as const;

const STATE_NAMES: Readonly<Record<string, string>> = {
  NC: "North Carolina",
  VA: "Virginia",
  TN: "Tennessee",
};

const TAIL = "isn't responding — try again shortly, or draw the boundary";

/** "Virginia parcel service isn't responding — try again shortly, or draw the boundary". */
export function serviceDownMessage(serviceUrl: string): string {
  let host = "";
  try {
    host = new URL(serviceUrl).host;
  } catch {
    /* an edited endpoint that isn't a URL: no state to name */
  }
  const name = STATE_NAMES[STATE_BY_HOST[host] ?? ""];
  return `${name ? `${name} parcel service` : "The parcel service"} ${TAIL}`;
}

/** Whether a hint is one of these, so whoever showed it can clear it. */
export const isServiceDownMessage = (h: string): boolean => h.endsWith(TAIL);
