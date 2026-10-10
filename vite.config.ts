import { defineConfig } from "vitest/config";

// Single self-contained ES module for HACS: dist/energy-tree-card.js
export default defineConfig({
  build: {
    lib: {
      entry: "src/energy-tree-card.ts",
      formats: ["es"],
      fileName: () => "energy-tree-card.js",
    },
    outDir: "dist",
    emptyOutDir: true,
    target: "es2021",
    sourcemap: false,
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
    // Date tests use local times; pin the zone so they behave the same on any machine and on CI (UTC).
    env: { TZ: "Europe/Bucharest" },
  },
});
