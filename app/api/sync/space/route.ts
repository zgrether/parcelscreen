import { handleCreateSpace } from "@/lib/server/syncRoutes";
import { noStore, syncStore } from "@/lib/server/syncStore";

// Step 5: makes a synced space for a new code (lib/server/syncRoutes.ts).
export const dynamic = "force-dynamic";

export function POST(req: Request): Promise<Response> {
  const store = syncStore();
  return store ? handleCreateSpace(req, store) : Promise.resolve(noStore());
}
