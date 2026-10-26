import { serverHttp } from "@/lib/server/http";
import { handleOverpass } from "@/lib/server/overpassRoute";

// One query, trying the mirrors in turn (the browser waits overpassRouteTimeoutMs, the same).
export const maxDuration = 180;

export function GET(req: Request): Promise<Response> {
  return handleOverpass(req, serverHttp);
}
