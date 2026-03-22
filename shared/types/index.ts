/** Common types shared across all services and tenants. */

export type TenantId = "tenant-1" | "tenant-2" | "tenant-3";
export type CloudProvider = "aws" | "gcp";

export interface ApiResponse<T> {
  data: T;
  tenantId: TenantId;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  code: string;
  message: string;
  tenantId?: TenantId;
}
