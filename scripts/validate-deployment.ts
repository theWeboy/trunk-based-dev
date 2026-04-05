#!/usr/bin/env bun
/**
 * Pre-production validation script.
 * Run via: bun run validate:production
 *
 * Checks performed:
 *  1. package.json version is valid semver
 *  2. No pending changeset files (Version Packages PR must be merged before prod)
 *  3. K8s overlays exist for all 3 tenants and all 3 environments
 *  4. TypeScript compiles without errors (delegates to typecheck.sh)
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

let failed = false;

function check(label: string, pass: boolean, detail?: string): void {
  if (pass) {
    console.log(`  [PASS] ${label}`);
  } else {
    console.error(`  [FAIL] ${label}${detail ? `: ${detail}` : ""}`);
    failed = true;
  }
}

function run(cmd: string): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
    });
    return { ok: true, output };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: err.stdout ?? err.stderr ?? err.message ?? "" };
  }
}

console.log("\n=== Pre-Production Validation ===\n");

// 1. Semver check
const pkg = JSON.parse(await Bun.file(join(ROOT, "package.json")).text()) as {
  version?: string;
};
const version = pkg.version ?? "";
const semverRegex = /^\d+\.\d+\.\d+$/;
check("package.json version is valid semver", semverRegex.test(version), version);

// 2. No pending changesets
const changesetDir = join(ROOT, ".changeset");
let pendingChangesets = 0;
if (existsSync(changesetDir)) {
  const files = readdirSync(changesetDir).filter((f) => f.endsWith(".md") && f !== "README.md");
  pendingChangesets = files.length;
  check(
    "No pending changeset files (Version Packages PR must be merged)",
    pendingChangesets === 0,
    pendingChangesets > 0 ? `Found: ${files.join(", ")}` : undefined
  );
} else {
  check("Changeset directory exists", false, ".changeset/ not found");
}

// 3. K8s overlays exist
const tenants = ["tenant-1", "tenant-2", "tenant-3"];
const envs = ["dev", "sandbox", "production"];
for (const tenant of tenants) {
  for (const env of envs) {
    const overlayPath = join(ROOT, "k8s", "overlays", tenant, env, "kustomization.yaml");
    check(`K8s overlay exists: ${tenant}/${env}`, existsSync(overlayPath));
  }
}

// 4. TypeScript compiles
console.log("\n  Running typecheck...");
const { ok: tscOk, output: tscOutput } = run("bash scripts/typecheck.sh");
check("TypeScript compiles without errors", tscOk, tscOk ? undefined : tscOutput.slice(0, 200));

// Summary
console.log("\n=================================");
if (failed) {
  console.error("\nValidation FAILED. Fix the issues above before deploying to production.\n");
  process.exit(1);
} else {
  console.log(`\nAll checks passed. Ready to deploy v${version} to production.\n`);
}
