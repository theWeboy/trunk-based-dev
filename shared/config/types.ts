import type { CloudProvider, TenantId } from "../types/index.js";

export interface TenantConfig {
  tenantId: TenantId;
  cloud: CloudProvider;
  region: string;
  currency: string;
  /** Notification channel used by the notification service. */
  notificationChannel: "sns" | "pubsub" | "email";
  /** Payment gateway identifier. */
  paymentGateway: string;
  /** Max items allowed per order. */
  maxOrderItems: number;
  featureFlags: {
    multiCurrencyEnabled: boolean;
    advancedRoutingEnabled: boolean;
    webhooksEnabled: boolean;
  };
}
