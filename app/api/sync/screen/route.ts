import { handleScreen } from "@/lib/server/syncRoutes";
import { withStore } from "@/lib/server/syncStore";

// Step 5: one kept screen, fetched when its parcel is opened.
export const dynamic = "force-dynamic";

export function GET(req: Request): Promise<Response> {
  return withStore((store) => handleScreen(req, store));
}
