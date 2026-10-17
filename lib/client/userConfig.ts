/**
 * The user's Settings (thresholds, unit costs, anchors, endpoints, time zone) under
 * "ps.cfg" in the current profile's documents (step 1, PR 4), merged over the defaults and validated. The Settings dialog (step 16a, lib/client/settingsForm.ts)
 * edits it; ExploreShell holds the live copy.
 */
import { DEFAULT_USER_CONFIG, migrateEndpoints } from "@/lib/screen/config";
import { UserConfigSchema, type UserConfig } from "@/lib/screen/types";
import type { KeyValueStore } from "./prefs";
import { activeKv } from "./profileKv";

const KEY = "ps.cfg";

/** The current profile's documents (step 1, PR 4): the settings are the profile's. */
const store = (): KeyValueStore | null => activeKv();

/** Stored settings over the defaults; anything unreadable or invalid falls back to the defaults. */
export function loadUserConfig(from: KeyValueStore | null = store()): UserConfig {
  try {
    const raw = from?.getItem(KEY);
    if (!raw) return DEFAULT_USER_CONFIG;
    const stored = JSON.parse(raw) as Partial<UserConfig>;
    const merged = {
      ...DEFAULT_USER_CONFIG,
      ...stored,
      // A config saved before relief culverts had their own rate keeps its culvert rate for them (owner, 2026-10-11).
      dw: {
        ...DEFAULT_USER_CONFIG.dw,
        ...(stored.dw?.culvertEach !== undefined ? { reliefCulvertEach: stored.dw.culvertEach } : {}),
        ...stored.dw,
      },
      budget: { ...DEFAULT_USER_CONFIG.budget, ...stored.budget },
      endpoints: migrateEndpoints(stored.endpoints),
    };
    const parsed = UserConfigSchema.safeParse(merged);
    return parsed.success ? parsed.data : DEFAULT_USER_CONFIG;
  } catch {
    return DEFAULT_USER_CONFIG;
  }
}

export function saveUserConfig(cfg: UserConfig, to: KeyValueStore | null = store()): void {
  try {
    to?.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* storage unavailable: settings last for this page only */
  }
}
