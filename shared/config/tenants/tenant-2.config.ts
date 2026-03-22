import type { TenantConfig } from "../types.js";

/** tenant-2: GCP (us-central1). Primary EU/global tenant. */
export const tenant2Config: TenantConfig = {
  tenantId: "tenant-2",
  cloud: "gcp",
  region: "us-central1",
  currency: "EUR",
  notificationChannel: "pubsub",
  paymentGateway: "stripe-eu",
  maxOrderItems: 50,
  featureFlags: {
    multiCurrencyEnabled: true,
    advancedRoutingEnabled: true,
    webhooksEnabled: true,
  },
};
