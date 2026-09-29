import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = { "@": path.resolve(__dirname, ".") };

export default defineConfig({
  resolve: { alias },
  esbuild: { jsx: "automatic" },
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      include: ["lib/**/*.ts", "modules/**/*.ts", "app/api/**/*.ts"],
      exclude: ["**/*.d.ts", "lib/auth/client.ts", "lib/client/**", "lib/ai/**", "modules/ai/**", "app/api/ai/**", "app/api/auth/**", "**/index.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
        "lib/permissions/**": { lines: 95, functions: 95, branches: 90, statements: 95 },
        "lib/workflows/**": { lines: 90, functions: 90, branches: 80, statements: 90 },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/setup/unit.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["tests/unit/**/*.test.tsx"],
          setupFiles: ["tests/setup/unit.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/setup/integration.ts"],
          globalSetup: ["tests/setup/integration.global.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
