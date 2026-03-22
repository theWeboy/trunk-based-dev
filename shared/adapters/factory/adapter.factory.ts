import type { TenantId } from "../../types/index.js";
import { getTenantOrDefault } from "../../utils/env.js";
import type { IServiceAdapter } from "../base/service.adapter.js";
import { Tenant1Adapter } from "../tenant-1/tenant-1.adapter.js";
import { Tenant2Adapter } from "../tenant-2/tenant-2.adapter.js";
import { Tenant3Adapter } from "../tenant-3/tenant-3.adapter.js";

const adapters: Record<TenantId, () => IServiceAdapter> = {
  "tenant-1": () => new Tenant1Adapter(),
  "tenant-2": () => new Tenant2Adapter(),
  "tenant-3": () => new Tenant3Adapter(),
};

/**
 * Returns the service adapter for the given tenant.
 * When tenantId is omitted, reads from the TENANT environment variable.
 */
export function getAdapter(tenantId?: TenantId): IServiceAdapter {
  const id = tenantId ?? getTenantOrDefault();
  const factory = adapters[id];
  if (!factory) throw new Error(`No adapter registered for tenant "${id}"`);
  return factory();
}
