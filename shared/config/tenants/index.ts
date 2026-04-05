import type { TenantId } from "../../types/index.js";
import type { TenantConfig } from "../types.js";
import { tenant1Config } from "./tenant-1.config.js";
import { tenant2Config } from "./tenant-2.config.js";
import { tenant3Config } from "./tenant-3.config.js";

const configs: Record<TenantId, TenantConfig> = {
  "tenant-1": tenant1Config,
  "tenant-2": tenant2Config,
  "tenant-3": tenant3Config,
};

export function getTenantConfig(tenantId: TenantId): TenantConfig {
  const config = configs[tenantId];
  if (!config) throw new Error(`No config found for tenant "${tenantId}"`);
  return config;
}

export type { TenantConfig };
export { tenant1Config, tenant2Config, tenant3Config };
