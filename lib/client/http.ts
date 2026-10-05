// The page's one HTTP client (map layers, parcel lookups): browser mode, so no custom headers.
// The screen itself runs in the worker with its own client. All external fetches go through lib/http.
import { createHttpClient } from "@/lib/http";

export const browserHttp = createHttpClient({ env: "browser" });
