import { handleRedeemInvite } from "@/lib/server/syncRoutes";
import { withStore } from "@/lib/server/syncStore";

// UX part 2 PR 5b: uses an invite, once (lib/server/syncRoutes.ts).
export const dynamic = "force-dynamic";

export function POST(req: Request): Promise<Response> {
  return withStore((store) => handleRedeemInvite(req, store));
}
