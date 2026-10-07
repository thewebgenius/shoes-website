import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside a React Server environment; unit tests run server code directly.
      "server-only": path.resolve(import.meta.dirname, "tests/unit/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://unit:unit@localhost:5432/unit",
      APP_SECRET: "unit-test-secret-unit-test-secret-0123456789",
    },
  },
});
