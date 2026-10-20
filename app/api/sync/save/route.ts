import { handleSave } from "@/lib/server/syncRoutes";
import { withStore } from "@/lib/server/syncStore";

// Step 5: a batch of whole records from a joined device.
export const dynamic = "force-dynamic";

export function POST(req: Request): Promise<Response> {
  return withStore((store) => handleSave(req, store));
}
