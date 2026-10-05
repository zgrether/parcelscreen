import { serverHttp } from "@/lib/server/http";
import { handleOverpass } from "@/lib/server/overpassRoute";

// Three queries, each trying the mirrors in turn (the browser waits overpassRouteTimeoutMs, the same).
export const maxDuration = 120;

export function GET(req: Request): Promise<Response> {
  return handleOverpass(req, serverHttp);
}
