import type { TenantConfig } from "../types.js";

/** tenant-3: GCP (europe-west1). European tenant with stricter order limits. */
export const tenant3Config: TenantConfig = {
  tenantId: "tenant-3",
  cloud: "gcp",
  region: "europe-west1",
  currency: "GBP",
  notificationChannel: "pubsub",
  paymentGateway: "adyen-eu",
  maxOrderItems: 25,
  featureFlags: {
    multiCurrencyEnabled: true,
    advancedRoutingEnabled: false,
    webhooksEnabled: false,
  },
};
