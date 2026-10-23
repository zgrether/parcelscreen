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

  it("kind=roads asks for the OSM tracks and service roads near the point, once (VR3a); any other kind is refused", async () => {
    const way = {
      type: "way",
      id: 1,
      tags: { highway: "track" },
      geometry: [
        { lat: 36.3, lon: -81.6 },
        { lat: 36.31, lon: -81.6 },
      ],
    };
    const { http, seen } = fakeHttp(() => new Response(JSON.stringify({ elements: [way] })));
    const r = await handleOverpass(get("?kind=roads&lat=36.326382&lon=-81.627171"), http);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { elements: unknown[] }).elements).toEqual([way]);
    expect(seen).toHaveLength(1);
    expect(decodeURIComponent(seen[0]!.url)).toContain(
      'way["highway"~"^(track|service|unclassified)$"](around:1500,36.326382,-81.627171)',
    );
    expect((await handleOverpass(get("?kind=anything&lat=36.3&lon=-81.6"), http)).status).toBe(400);
  });

  it("kind=parking asks for the parking near up to five trailheads, once (follow-up 54); anything else is refused", async () => {
    const lot = { type: "way", center: { lat: 36.79, lon: -80.47 }, tags: { amenity: "parking" } };
    const { http, seen } = fakeHttp(() => new Response(JSON.stringify({ elements: [lot] })));
    const r = await handleOverpass(get("?kind=parking&pts=36.794189,-80.466528;36.6,-81.5"), http);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { elements: unknown[] }).elements).toEqual([lot]);
    expect(seen).toHaveLength(1);
    expect(decodeURIComponent(seen[0]!.url)).toContain(
      'nwr["amenity"="parking"](around:300,36.794189,-80.466528);nwr["amenity"="parking"](around:300,36.600000,-81.500000);',
    );
    const six = Array(6).fill("36.6,-81.5").join(";");
    for (const qs of [
      "?kind=parking",
      "?kind=parking&pts=",
      "?kind=parking&pts=abc",
      "?kind=parking&pts=91,-81",
      `?kind=parking&pts=${six}`,
    ])
      expect((await handleOverpass(get(qs), http)).status).toBe(400);
    expect(seen).toHaveLength(1);
  });

  it("runs the prototype's queries but hospitals' (§9.69) on the default mirrors with an identifying User-Agent", async () => {
    const { http, seen } = fakeHttp(() => new Response(JSON.stringify({ elements: [hospital] })));
    const r = await handleOverpass(get("?lat=36.9&lon=-80.5"), http);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, s-maxage=86400");
    expect(((await r.json()) as { elements: unknown[] }).elements).toHaveLength(2);
    expect(seen.map((s) => s.url.split("/")[2])).toEqual(Array(2).fill("overpass-api.de"));
    expect(seen.every((s) => s.ua === SERVER_USER_AGENT)).toBe(true);
    expect(SERVER_USER_AGENT).toMatch(
      /^ParcelScreen\/\S+ \(\+https:\/\/github\.com\/zgrether\/parcelscreen\)$/,
    );
    expect(decodeURIComponent(seen[0]!.url)).toContain('node["shop"="supermarket"]');
    expect(seen.some((s) => decodeURIComponent(s.url).includes("hospital"))).toBe(false);
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

describe("PS_OVERPASS=off (the e2e server)", () => {
  it("answers as no mirror answering, at once, without a request", async () => {
    const { http, seen } = fakeHttp(() => new Response("{}"));
    const res = await handleOverpass(
      new Request("http://localhost/api/places/overpass?lat=36.6&lon=-81.5&kind=places"),
      http,
      { PS_OVERPASS: "off" },
    );
    expect(res.status).toBe(503);
    expect(seen).toEqual([]);
  });
});
