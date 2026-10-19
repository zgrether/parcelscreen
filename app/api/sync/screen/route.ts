import { handleScreen } from "@/lib/server/syncRoutes";
import { noStore, syncStore } from "@/lib/server/syncStore";

// Step 5: one kept screen, fetched when its parcel is opened.
export const dynamic = "force-dynamic";

export function GET(req: Request): Promise<Response> {
  const store = syncStore();
  return store ? handleScreen(req, store) : Promise.resolve(noStore());
}
