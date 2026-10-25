import { handleCreateInvite } from "@/lib/server/syncRoutes";
import { withStore } from "@/lib/server/syncStore";

// UX part 2 PR 5b: keeps a one-use invite to the space (lib/server/syncRoutes.ts).
export const dynamic = "force-dynamic";

export function POST(req: Request): Promise<Response> {
  return withStore((store) => handleCreateInvite(req, store));
}
