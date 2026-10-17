/**
 * When a state's parcel service doesn't answer (owner, after 16b: VGIN returned HTTP 500 for hours on
 * 2026-10-07 and the explorer said nothing). The lines, a tap and the parcel-number search all say so in
 * these words, naming the state.
 *
 * Parcel requests also get the flood step's timeout rule (follow-up 22): one retry after a timeout, with a
 * longer limit. An HTTP error or a refused request isn't retried; moving the map asks again.
 */
import { HttpError, TimeoutError } from "../http";
import { stateOf } from "./parcelFields";

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
  // An edited endpoint that isn't a known service names no state.
  const name = STATE_NAMES[stateOf(serviceUrl) ?? ""];
  return `${name ? `${name} parcel service` : "The parcel service"} ${TAIL}`;
}

/**
 * Whether a parcel-service request failed because the service didn't answer: a timeout, an HTTP error or an
 * ArcGIS error in the body (HttpError), or no connection at all (fetch's TypeError, as when offline). A
 * cancelled request, or a record that isn't there, isn't the service being down.
 */
export const isServiceDown = (e: unknown): boolean =>
  e instanceof TimeoutError || e instanceof HttpError || e instanceof TypeError;

/** Whether a hint is one of these, so whoever showed it can clear it. */
export const isServiceDownMessage = (h: string): boolean => h.endsWith(TAIL);
