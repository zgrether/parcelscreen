import { handleHealth } from "@/lib/server/syncRoutes";
import { noStore, syncStore } from "@/lib/server/syncStore";

// Step 5: the keep-alive's daily read (.github/workflows/supabase-keepalive.yml), so the free plan doesn't pause the
// project. No code, no data: { ok } only.
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  const store = syncStore();
  return store ? handleHealth(store) : Promise.resolve(noStore());
}
