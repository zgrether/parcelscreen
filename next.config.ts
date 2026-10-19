import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // "What the grade means" became Help's "How grades work" (step 4b). The browser keeps a link's #rule-<panel> across the
  // redirect, so every old "How it's scored" link still lands on its rule.
  async redirects() {
    return [{ source: "/rulebook", destination: "/help", permanent: false }];
  },
};

// Serwist's Turbopack integration (step 17c): the service worker is built by a route handler, not a webpack
// plugin, so the build stays on Turbopack.
export default withSerwist(nextConfig);
