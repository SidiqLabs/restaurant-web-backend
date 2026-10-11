import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    // Focused payment verification; use the default config for all regressions.
    // Both configurations require an explicitly verified isolated test database.
    include: ["tests/payment-best-seller.test.ts", "tests/app.test.ts", "tests/openapi.test.ts", "tests/orders-schema.test.ts"],
    setupFiles: ["./tests/session-5c4.setup.ts"],
    exclude: ["dist/**", "node_modules/**", "tests/orders-storage.test.ts"],
  },
});
