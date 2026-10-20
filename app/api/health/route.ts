import { handleHealth } from "@/lib/server/syncRoutes";
import { withStore } from "@/lib/server/syncStore";

// Step 5: the keep-alive's daily read (.github/workflows/supabase-keepalive.yml), so the free plan doesn't pause the
// project. No code, no data: { ok } only. A real read through the routes' own store: when the sync routes can't reach
// the database, neither can this, and it answers 503, which fails the keep-alive's `curl --fail`.
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return withStore(handleHealth);
}
