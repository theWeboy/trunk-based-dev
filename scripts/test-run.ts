#!/usr/bin/env bun

const rawArgs = Bun.argv.slice(2);
const vitestArgs: string[] = [];

let coverageThreshold = "";

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === undefined) {
    continue;
  }

  if (arg.startsWith("--coverage-threshold=")) {
    coverageThreshold = arg.split("=", 2)[1] ?? "";
    continue;
  }

  if (arg === "--coverage-threshold") {
    coverageThreshold = rawArgs[index + 1] ?? "";
    index += 1;
    continue;
  }

  vitestArgs.push(arg);
}

const child = Bun.spawnSync({
  cmd: ["bunx", "vitest", "run", ...vitestArgs],
  env: {
    ...process.env,
    ...(coverageThreshold !== "" ? { COVERAGE_THRESHOLD: coverageThreshold } : {}),
  },
  stdio: ["inherit", "inherit", "inherit"],
});

process.exit(child.exitCode);
