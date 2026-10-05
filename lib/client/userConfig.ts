/**
 * The user's Settings (thresholds, unit costs, anchors, endpoints, time zone) in localStorage under
 * "ps.cfg", merged over the defaults and validated. The Settings dialog (step 16) edits it; until then the
 * app reads the defaults through here.
 */
import { DEFAULT_USER_CONFIG, migrateEndpoints } from "@/lib/screen/config";
import { UserConfigSchema, type UserConfig } from "@/lib/screen/types";
import type { KeyValueStore } from "./prefs";

const KEY = "ps.cfg";

function store(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Stored settings over the defaults; anything unreadable or invalid falls back to the defaults. */
export function loadUserConfig(from: KeyValueStore | null = store()): UserConfig {
  try {
    const raw = from?.getItem(KEY);
    if (!raw) return DEFAULT_USER_CONFIG;
    const stored = JSON.parse(raw) as Partial<UserConfig>;
    const merged = {
      ...DEFAULT_USER_CONFIG,
      ...stored,
      dw: { ...DEFAULT_USER_CONFIG.dw, ...stored.dw },
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
