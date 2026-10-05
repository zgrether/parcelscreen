import { describe, expect, it } from "vitest";
import { createHttpClient, type HttpClient } from "../http";
import { handleOverpass } from "./overpassRoute";
import { SERVER_USER_AGENT } from "./http";

const hospital = { type: "node", lat: 36.95, lon: -80.45, tags: { amenity: "hospital", name: "Carilion" } };
const get = (qs: string) => new Request(`https://parcelscreen.test/api/places/overpass${qs}`);

/** A node-mode client over a fake fetch, recording each URL and its User-Agent. */
function fakeHttp(answer: (url: string) => Response): {
  http: HttpClient;
  seen: { url: string; ua: string }[];
} {
  const seen: { url: string; ua: string }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, ua: new Headers(init?.headers).get("user-agent") ?? "" });
    return answer(url);
  }) as typeof fetch;
  return {
    http: createHttpClient({ env: "node", userAgent: SERVER_USER_AGENT, fetchImpl, hostPolicies: {} }),
    seen,
  };
}

describe("GET /api/places/overpass", () => {
  it("rejects anything but a lat/lon pair: no QL, no other hosts", async () => {
    const { http, seen } = fakeHttp(() => new Response("{}"));
    for (const qs of ["", "?lat=36.6", "?lat=abc&lon=-81", "?lat=91&lon=-81", "?data=[out:json];node;out;"])
      expect((await handleOverpass(get(qs), http)).status).toBe(400);
    expect(seen).toEqual([]);
  });

  it("runs the three prototype queries on the default mirrors with an identifying User-Agent", async () => {
    const { http, seen } = fakeHttp(() => new Response(JSON.stringify({ elements: [hospital] })));
    const r = await handleOverpass(get("?lat=36.9&lon=-80.5"), http);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, s-maxage=86400");
    expect(((await r.json()) as { elements: unknown[] }).elements).toHaveLength(3);
    expect(seen.map((s) => s.url.split("/")[2])).toEqual(Array(3).fill("overpass-api.de"));
    expect(seen.every((s) => s.ua === SERVER_USER_AGENT)).toBe(true);
    expect(SERVER_USER_AGENT).toMatch(
      /^ParcelScreen\/\S+ \(\+https:\/\/github\.com\/zgrether\/parcelscreen\)$/,
    );
    expect(decodeURIComponent(seen[0]!.url)).toContain('node["amenity"="hospital"]');
  });

  it("answers 502 with the same 'Overpass unreachable (…)' message when every mirror fails", async () => {
    const { http } = fakeHttp(() => new Response("nope", { status: 403 }));
    const r = await handleOverpass(get("?lat=36.9&lon=-80.5"), http);
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({
      error:
        "Overpass unreachable (overpass-api.de 403; overpass.openstreetmap.fr 403; overpass.kumi.systems 403)",
    });
  });
});
