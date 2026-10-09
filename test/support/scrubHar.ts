/**
 * What a recording keeps out of the repo (owner, #89 pre-flight review, before going public): cookies and auth
 * headers in either direction, and owner or mailing fields in a parcel service's answer. Both recorders run every
 * entry through scrubEntry before writing: `pnpm record:port` (network-port.har) and `pnpm record:fixtures`
 * (network.har, re-recorded only with a recorded decision to re-pin). The app asks the parcel services only for
 * the fields it reads (lib/geo/parcelFields.ts); this is the backstop if a service answers with more.
 *
 * Replay matches requests by method, URL and body (replayFetch.ts requestKey), never by headers or cookies, and
 * no parcel field the app reads is an owner or mailing field in this sense except the owner name and site
 * address, which are redacted too: a fixture's parcel facts then show neither.
 */
import { gunzipSync, gzipSync } from "node:zlib";
import type { Har, HarEntry } from "./replayFetch.ts";

/** Headers dropped from requests and responses. */
const SECRET_HEADER = /^(cookie|set-cookie|authorization|proxy-authorization|x-api-key|x-auth-token)$/i;

/**
 * The parcel services' hosts: the only answers whose fields are scrubbed (PAD-US's Own_Type is public land). Listed
 * here rather than read from config.ts, so scripts/record-fixtures.mts can run this under plain Node;
 * scrubHar.test.ts checks it against DEFAULT_ENDPOINTS.parcels.
 */
export const PARCEL_HOSTS = new Set([
  "services.nconemap.gov",
  "vginmaps.vdem.virginia.gov",
  "geoviewer.cot.tn.gov",
]);

/**
 * Owner and mailing fields as the state services name them: NC OneMap (ownname, ownname2, ownfrst, ownlast,
 * owntype, subowntype, subsurfown, mailadd, munit, mcity, mstate, mzip, madd*), TN (OWNER, OWNER2, OWNJAN1*),
 * site addresses (siteadd, saddno…, ADDRESS, ST_NUM, STREET, SITE_ADDRESS), and any `*owner*` / `*mail*` key.
 */
export const OWNER_FIELD =
  /^(own|subown|subsurfown|mail|madd|munit|mcity|mstate|mzip|siteadd|sunit|scity|sstate|szip|sadd|st_num|street|address$|site_address)|owner|mail/i;

const PLACEHOLDER = "[redacted]";

/** Replaces owner and mailing values anywhere in a parsed answer (features' properties or attributes). */
function redact(v: unknown): number {
  let n = 0;
  if (Array.isArray(v)) for (const x of v) n += redact(x);
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (OWNER_FIELD.test(k) && (typeof x === "string" || typeof x === "number")) {
        (v as Record<string, unknown>)[k] = PLACEHOLDER;
        n++;
      } else n += redact(x);
    }
  return n;
}

/** A response body as text, its encoding undone; null when it's binary or not JSON. */
function bodyJson(c: HarEntry["response"]["content"]): { json: unknown; gz: boolean } | null {
  if (c.text == null) return null;
  let b = c.encoding === "base64" ? Buffer.from(c.text, "base64") : Buffer.from(c.text, "utf8");
  const gz = b[0] === 0x1f && b[1] === 0x8b;
  if (gz) b = gunzipSync(b);
  try {
    return { json: JSON.parse(b.toString("utf8")), gz };
  } catch {
    return null;
  }
}

/** One entry, scrubbed (a copy). Counts what it removed, for the recorder's log. */
export function scrubEntry(e: HarEntry): { entry: HarEntry; headers: number; fields: number } {
  const keep = (hs: HarEntry["request"]["headers"]) => hs.filter((h) => !SECRET_HEADER.test(h.name));
  const reqH = keep(e.request.headers ?? []),
    resH = keep(e.response.headers ?? []);
  const headers =
    (e.request.headers?.length ?? 0) - reqH.length + (e.response.headers?.length ?? 0) - resH.length;
  // Playwright's HARs also list cookies apart from the headers.
  const { cookies: _rq, ...request } = e.request as HarEntry["request"] & { cookies?: unknown };
  const { cookies: _rs, ...response } = e.response as HarEntry["response"] & { cookies?: unknown };
  const entry: HarEntry = {
    ...e,
    request: { ...request, headers: reqH },
    response: { ...response, headers: resH },
  };
  let fields = 0;
  if (PARCEL_HOSTS.has(new URL(e.request.url).host)) {
    const parsed = bodyJson(e.response.content);
    if (parsed) {
      fields = redact(parsed.json);
      if (fields) {
        let b = Buffer.from(JSON.stringify(parsed.json), "utf8");
        if (parsed.gz) b = gzipSync(b);
        const base64 = e.response.content.encoding === "base64" || parsed.gz;
        entry.response.content = {
          ...e.response.content,
          size: b.length,
          text: base64 ? b.toString("base64") : b.toString("utf8"),
          ...(base64 ? { encoding: "base64" } : {}),
        };
      }
    }
  }
  return { entry, headers, fields };
}

/** Every entry of a HAR, scrubbed. */
export function scrubHar<T extends Har>(har: T): { har: T; headers: number; fields: number } {
  let headers = 0,
    fields = 0;
  const entries = har.log.entries.map((e) => {
    const s = scrubEntry(e);
    headers += s.headers;
    fields += s.fields;
    return s.entry;
  });
  return { har: { ...har, log: { ...har.log, entries } }, headers, fields };
}
