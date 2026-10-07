import { describe, expect, it } from "vitest";
import { OFFLINE_TEXT, unreachableMessage } from "@/lib/client/pwa";
import { CancelledError, HttpError, TimeoutError, type HttpClient } from "@/lib/http";
import { DEFAULT_ENDPOINTS } from "@/lib/screen/config";
import { fullRecord } from "./parcelTiles";
import { isServiceDown, isServiceDownMessage, serviceDownMessage } from "./serviceStatus";

const VA = DEFAULT_ENDPOINTS.parcels[1]!;

describe("the parcel service message (owner, after 16b)", () => {
  it("names the state, in the owner's words", () => {
    const [nc, va, tn] = DEFAULT_ENDPOINTS.parcels;
    expect(serviceDownMessage(va!)).toBe(
      "Virginia parcel service isn't responding — try again shortly, or draw the boundary",
    );
    expect(serviceDownMessage(nc!)).toMatch(/^North Carolina parcel service isn't responding/);
    expect(serviceDownMessage(tn!)).toMatch(/^Tennessee parcel service isn't responding/);
    expect(serviceDownMessage("https://example.org/parcels/0")).toMatch(
      /^The parcel service isn't responding/,
    );
    expect(serviceDownMessage("not a url")).toMatch(/^The parcel service/);
    expect(isServiceDownMessage(serviceDownMessage(va!))).toBe(true);
    expect(isServiceDownMessage("Zoom in to see parcel lines")).toBe(false);
  });
});

/** A record fetch whose single request ends as `answer` does: a Response, or a thrown error. */
const recordWith = (answer: () => Response) => {
  const http = { fetch: async () => answer() } as unknown as HttpClient;
  return fullRecord(http, { props: { OBJECTID: 7 }, source: VA });
};
const failureOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

describe("a failed record fetch names the failing service (owner, after 17c)", () => {
  it("an HTTP error", async () => {
    const e = await failureOf(recordWith(() => new Response("", { status: 500 })));
    expect(e).toBeInstanceOf(HttpError);
    expect((e as HttpError).status).toBe(500);
    expect(isServiceDown(e)).toBe(true);
  });

  it("an ArcGIS error in a 200 body (how VGIN failed on 2026-10-07)", async () => {
    const e = await failureOf(
      recordWith(() => Response.json({ error: { code: 500, message: "Unable to complete operation." } })),
    );
    expect(e).toBeInstanceOf(HttpError);
    expect(isServiceDown(e)).toBe(true);
  });

  it("a timeout", async () => {
    const e = await failureOf(
      recordWith(() => {
        throw new TimeoutError(VA);
      }),
    );
    expect(isServiceDown(e)).toBe(true);
  });

  it("offline: no connection at all, and the offline words instead of the state's service", async () => {
    const e = await failureOf(
      recordWith(() => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect(isServiceDown(e)).toBe(true);
    expect(unreachableMessage(serviceDownMessage(VA), false)).toBe(OFFLINE_TEXT);
    expect(unreachableMessage(serviceDownMessage(VA), true)).toMatch(
      /^Virginia parcel service isn't responding/,
    );
  });

  it("isn't the service being down: a cancelled request, or a record that isn't there", async () => {
    const cancelled = await failureOf(
      recordWith(() => {
        throw new CancelledError();
      }),
    );
    expect(isServiceDown(cancelled)).toBe(false);
    const missing = await failureOf(recordWith(() => Response.json({ features: [] })));
    expect(missing).toBeInstanceOf(Error);
    expect(isServiceDown(missing)).toBe(false);
  });
});
