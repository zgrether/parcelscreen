import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

// Serwist's Turbopack integration (step 17c): the service worker is built by a route handler, not a webpack
// plugin, so the build stays on Turbopack.
export default withSerwist(nextConfig);
