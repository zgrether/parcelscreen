import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    // Tests run in Node on purpose: it proves lib/screen has no DOM dependency, and that the report blocks
    // (components/Results/blocks, rendered with react-dom/server) render on a server too (step 14 plan §8).
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.ts", "components/**/*.test.tsx", "test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    // Parity tests run the pipeline over real recorded DEMs; CI runners are slower than a laptop.
    testTimeout: 30_000,
  },
});
