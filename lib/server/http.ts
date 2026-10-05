/**
 * The HTTP client for server routes: Node mode, so it sends an identifying User-Agent (which some volunteer
 * services now require; a browser can't set one). One instance per server process.
 */
import { createHttpClient } from "../http";
import pkg from "../../package.json";

export const SERVER_USER_AGENT = `ParcelScreen/${pkg.version} (+https://github.com/zgrether/parcelscreen)`;

export const serverHttp = createHttpClient({ env: "node", userAgent: SERVER_USER_AGENT });
