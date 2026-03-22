import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const parsedCoverageThreshold = Number.parseInt(process.env["COVERAGE_THRESHOLD"] ?? "", 10);
const coverageThresholds = Number.isFinite(parsedCoverageThreshold)
  ? {
      lines: parsedCoverageThreshold,
      functions: parsedCoverageThreshold,
      branches: parsedCoverageThreshold,
      statements: parsedCoverageThreshold,
    }
  : undefined;

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["services/**/*.ts", "shared/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/encore.service.ts",
        "**/types.ts",
        "shared/types/**/*.ts",
        "shared/config/types.ts",
        "shared/adapters/base/service.adapter.ts",
      ],
      thresholds: coverageThresholds,
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "services"),
      "@shared": resolve(__dirname, "shared"),
    },
  },
});
