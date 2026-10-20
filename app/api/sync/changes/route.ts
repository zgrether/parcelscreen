import { handleChanges } from "@/lib/server/syncRoutes";
import { noStore, syncStore } from "@/lib/server/syncStore";

// Step 5: what changed in a synced space since the device's last fetch.
export const dynamic = "force-dynamic";

export function GET(req: Request): Promise<Response> {
  const store = syncStore();
  return store ? handleChanges(req, store) : Promise.resolve(noStore());
}
