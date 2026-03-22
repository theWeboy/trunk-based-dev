import type { TenantConfig } from "../types.js";

/** tenant-1: AWS (us-east-1). Primary US tenant. */
export const tenant1Config: TenantConfig = {
  tenantId: "tenant-1",
  cloud: "aws",
  region: "us-east-1",
  currency: "USD",
  notificationChannel: "sns",
  paymentGateway: "stripe-us",
  maxOrderItems: 100,
  featureFlags: {
    multiCurrencyEnabled: false,
    advancedRoutingEnabled: true,
    webhooksEnabled: true,
  },
};
