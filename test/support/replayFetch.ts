/**
 * A `fetch` that answers from a recorded HAR (test/fixtures/<slug>/network.har) and never touches the network.
 * docs/plans/phase-0.md §5.
 *
 * Requests are matched on method + URL + body, with query parameters and form-encoded bodies compared
 * order-insensitively (ArcGIS and SDA are POSTed as URLSearchParams). A request the prototype never made
 * throws ReplayMissError with the normalized key, so drift in what the port requests is loud, not silent.
 * If the same request was recorded more than once (e.g. a 3DEP retry after a 5xx), responses are replayed
 * in recorded order and the last one repeats.
 */
import { readFileSync } from "node:fs";

export interface HarHeader {
  name: string;
  value: string;
}
export interface HarEntry {
  startedDateTime: string;
  request: {
    method: string;
    url: string;
    headers: HarHeader[];
    postData?: { mimeType: string; text?: string; params?: { name: string; value?: string }[] };
  };
  response: {
    status: number;
    statusText: string;
    headers: HarHeader[];
    content: { size: number; mimeType: string; text?: string; encoding?: string };
  };
}
export interface Har {
  log: { entries: HarEntry[] };
}

export class ReplayMissError extends Error {
  constructor(readonly key: string) {
    super(`No recorded response for ${key}`);
    this.name = "ReplayMissError";
  }
}

export function loadHar(path: string): Har {
  return JSON.parse(readFileSync(path, "utf8")) as Har;
}

function sortedParams(p: URLSearchParams): string {
  return [...p.entries()]
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

/** The identity of a request for replay purposes. */
export function requestKey(
  method: string,
  url: string,
  body?: string | null,
  contentType?: string | null,
): string {
  const u = new URL(url);
  const query = sortedParams(u.searchParams);
  let b = "";
  if (body) {
    const formish = !contentType || contentType.includes("application/x-www-form-urlencoded");
    b = formish && !body.trimStart().startsWith("{") ? sortedParams(new URLSearchParams(body)) : body;
  }
  return `${method.toUpperCase()} ${u.origin}${u.pathname}${query ? "?" + query : ""}${b ? " BODY " + b : ""}`;
}

// Hop-by-hop or encoding headers that no longer describe the decoded body we hand back.
const DROP_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding", "connection"]);

function toResponse(e: HarEntry): Response {
  const { status, statusText, headers, content } = e.response;
  const h = new Headers();
  for (const { name, value } of headers) if (!DROP_HEADERS.has(name.toLowerCase())) h.append(name, value);
  const noBody = status === 204 || status === 304;
  const bytes =
    content.text == null
      ? new Uint8Array()
      : content.encoding === "base64"
        ? Buffer.from(content.text, "base64")
        : Buffer.from(content.text, "utf8");
  return new Response(noBody ? null : bytes, { status, statusText, headers: h });
}

export interface ReplayFetch {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>;
  /** Keys requested so far, in order (for asserting e.g. "no second DEM fetch"). */
  readonly requests: string[];
}

function bodyText(body: BodyInit | null | undefined): string | null {
  if (body == null) return null;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  throw new Error(`replayFetch: unsupported request body type ${Object.prototype.toString.call(body)}`);
}

export function createReplayFetch(har: Har): ReplayFetch {
  const queues = new Map<string, HarEntry[]>();
  for (const e of har.log.entries) {
    if (e.response.status === 0) continue; // aborted/blocked during recording; never a real answer
    const pd = e.request.postData;
    const body =
      pd?.text ??
      (pd?.params ? new URLSearchParams(pd.params.map((p) => [p.name, p.value ?? ""])).toString() : null);
    const key = requestKey(e.request.method, e.request.url, body, pd?.mimeType);
    const q = queues.get(key);
    if (q) q.push(e);
    else queues.set(key, [e]);
  }
  const served = new Map<string, number>();
  const requests: string[] = [];

  const replay = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (init?.signal?.aborted) throw init.signal.reason ?? new DOMException("Aborted", "AbortError");
    let method = init?.method ?? "GET";
    let url: string;
    let body = bodyText(init?.body);
    let contentType = new Headers(init?.headers).get("content-type");
    if (input instanceof Request) {
      method = init?.method ?? input.method;
      url = input.url;
      if (body == null && input.body) body = await input.clone().text();
      contentType ??= input.headers.get("content-type");
    } else url = String(input);
    if (init?.body instanceof URLSearchParams) contentType ??= "application/x-www-form-urlencoded";
    const key = requestKey(method, url, body, contentType);
    requests.push(key);
    const q = queues.get(key);
    if (!q) throw new ReplayMissError(key);
    const n = served.get(key) ?? 0;
    served.set(key, n + 1);
    return toResponse(q[Math.min(n, q.length - 1)]!);
  };
  return Object.assign(replay, { requests });
}
