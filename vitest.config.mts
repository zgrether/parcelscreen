import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    // Pipeline tests run in Node on purpose: it proves lib/screen has no DOM dependency.
    // A jsdom project for component tests is added in step 14.
    environment: "node",
    include: ["lib/**/*.test.ts", "test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    // Parity tests run the pipeline over real recorded DEMs; CI runners are slower than a laptop.
    testTimeout: 30_000,
  },
});
