#!/usr/bin/env bun

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const rootDir = new URL("..", import.meta.url).pathname;
const migrationsDir = join(rootDir, "migrations");
const databaseUrl = process.env.DATABASE_URL ?? "";

console.log("Starting dummy migration job...");

if (databaseUrl === "") {
  console.log("DATABASE_URL not set; skipping migrations for CI/CD parity testing.");
  process.exit(0);
}

if (!existsSync(migrationsDir)) {
  console.log("No migrations directory found; treating migration step as a no-op.");
  process.exit(0);
}

const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

if (migrationFiles.length === 0) {
  console.log("No SQL migration files found; nothing to apply.");
  process.exit(0);
}

console.log(`Found ${migrationFiles.length} migration file(s):`);
for (const file of migrationFiles) {
  console.log(`- ${file}`);
}

console.log(
  "Dummy repo does not apply SQL migrations; job completed successfully for pipeline validation."
);
