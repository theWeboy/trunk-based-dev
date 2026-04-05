import type { TenantId } from "../types/index.js";

const VALID_TENANTS: TenantId[] = ["tenant-1", "tenant-2", "tenant-3"];

/** Returns the current tenant from the TENANT environment variable. Throws if not set or invalid. */
export function getTenant(): TenantId {
  const tenant = process.env.TENANT;
  if (!tenant) throw new Error("TENANT environment variable is not set");
  if (!VALID_TENANTS.includes(tenant as TenantId)) {
    throw new Error(`Invalid TENANT "${tenant}". Must be one of: ${VALID_TENANTS.join(", ")}`);
  }
  return tenant as TenantId;
}

/** Returns the current tenant, falling back to a default for local development. */
export function getTenantOrDefault(defaultTenant: TenantId = "tenant-1"): TenantId {
  const tenant = process.env.TENANT;
  if (!tenant) return defaultTenant;
  if (!VALID_TENANTS.includes(tenant as TenantId)) return defaultTenant;
  return tenant as TenantId;
}

export function getNodeEnv(): string {
  return process.env.NODE_ENV ?? "development";
}

export function getRegion(): string {
  return process.env.REGION ?? "local";
}

export function isProduction(): boolean {
  return getNodeEnv() === "production";
}
