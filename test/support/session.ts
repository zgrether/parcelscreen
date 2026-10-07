/** A reference parcel's run replayed in Node, with its session view (what the map draws from). */
import { createHttpClient } from "@/lib/http";
import { DEFAULT_USER_CONFIG } from "@/lib/screen/config";
import { screen, type ScreenOutput } from "@/lib/screen";
import type { LatLon } from "@/lib/geo/types";
import { sessionView, type SessionView } from "@/lib/screen/worker-protocol";
import { loadFixture, type FixtureSlug } from "./fixtures";
import { instantClock } from "./pipeline";

export async function replayRun(
  slug: FixtureSlug,
  extra: { house?: LatLon } = {},
): Promise<ScreenOutput & { view: SessionView }> {
  const replay = loadFixture(slug).replayFetch();
  const out = await screen(
    { polygon: loadFixture(slug).input.polygon.geometry, config: DEFAULT_USER_CONFIG, ...extra },
    undefined,
    {
      http: createHttpClient({
        env: "node",
        fetchImpl: replay as unknown as typeof fetch,
        clock: instantClock(),
      }),
      sleep: async () => {},
    },
  );
  return { ...out, view: sessionView(out.session) };
}
