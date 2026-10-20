import { handleCreateSpace } from "@/lib/server/syncRoutes";
import { withStore } from "@/lib/server/syncStore";

// Step 5: makes a synced space for a new code (lib/server/syncRoutes.ts).
export const dynamic = "force-dynamic";

export function POST(req: Request): Promise<Response> {
  return withStore((store) => handleCreateSpace(req, store));
}
