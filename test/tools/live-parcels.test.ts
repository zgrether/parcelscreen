/**
 * The live parcel services, once a day (live-services.yml; owner, after #432: Hamilton County's host died on about
 * 2026-10-30 and nothing said so for two weeks). Each service is asked, the way a tap asks it (lib/geo/parcels.ts
 * pickParcelAt), for the parcel at a point where it has one; a service that errors or answers none fails its test, and
 * the workflow's failure opens an issue (scheduled-failure.yml).
 *
 *   pnpm exec vitest run test/tools/live-parcels.test.ts --mode live-parcels
 *
 * Read-only. Only whether a parcel came back is printed, never its fields (owner fields stay out of the repo).
 */
import { describe, expect, it } from "vitest";
import { pickParcelAt } from "@/lib/geo/parcels";
import type { LatLon } from "@/lib/geo/types";
import { createHttpClient, realClock } from "@/lib/http";
import { DEFAULT_ENDPOINTS } from "@/lib/screen/config";

const live = () =>
  (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;

const service = (host: string): string => {
  const url = DEFAULT_ENDPOINTS.parcels.find((u) => new URL(u).hostname === host);
  if (!url) throw new Error(`No parcel service on ${host} in DEFAULT_ENDPOINTS`);
  return url;
};
const STATE_TN = DEFAULT_ENDPOINTS.parcels.find((u) => u.includes("Tennessee_Property_Boundaries"))!;

/** Each service, and a point where it has a parcel. */
const CHECKS: { name: string; url: string; at: LatLon }[] = [
  {
    name: "North Carolina (NC OneMap), downtown Boone",
    url: service("services.nconemap.gov"),
    at: [36.2168, -81.6746],
  },
  {
    name: "Virginia (VGIN), the Mud Creek fixture",
    url: service("vginmaps.vdem.virginia.gov"),
    at: [36.585425, -81.561989],
  },
  {
    name: "Tennessee (the Comptroller), the Roan Mountain fixture",
    url: STATE_TN,
    at: [36.186698, -82.075222],
  },
  {
    name: "Hamilton County, TN, Three Gorges Farms",
    url: service("gis.hamiltontn.gov"),
    at: [35.29479, -85.20988],
  },
];

describe.runIf(import.meta.env.MODE === "live-parcels")("the live parcel services", () => {
  const http = createHttpClient({ env: "node", fetchImpl: live(), clock: realClock });

  it.each(CHECKS)(
    "$name answers with a parcel",
    async ({ url, at }) => {
      const { parcel, report } = await pickParcelAt(http, [url], at);
      expect(parcel, `${url}: ${report.join("; ") || "no answer"}`).not.toBeNull();
    },
    120_000,
  );
});
