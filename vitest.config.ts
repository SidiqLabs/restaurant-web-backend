import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Auth tests clear shared users; database integration files must not overlap.
    fileParallelism: false,
    setupFiles: ["./tests/setup.ts"],
  },
});
