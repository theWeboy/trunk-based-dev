import { tenant3Config } from "../../config/tenants/index.js";
import type { IServiceAdapter, OrderValidationResult } from "../base/service.adapter.js";

/**
 * Adapter for tenant-3 (GCP, europe-west1).
 * - Notification via GCP Pub/Sub pattern
 * - Payment via Adyen EU (stricter compliance)
 * - Max 25 items per order; GBP/EUR only
 */
export class Tenant3Adapter implements IServiceAdapter {
  readonly tenantId = tenant3Config.tenantId;
  readonly cloud = tenant3Config.cloud;

  validateOrder(order: { items: unknown[]; currency: string }): OrderValidationResult {
    if (order.items.length > tenant3Config.maxOrderItems) {
      return {
        valid: false,
        reason: `tenant-3 allows max ${tenant3Config.maxOrderItems} items per order (EU compliance)`,
      };
    }
    const supportedCurrencies = ["GBP", "EUR"];
    if (!supportedCurrencies.includes(order.currency)) {
      return {
        valid: false,
        reason: `tenant-3 only accepts ${supportedCurrencies.join(", ")} (EU region)`,
      };
    }
    return { valid: true };
  }

  getNotificationChannel(): string {
    return `gcp-${tenant3Config.notificationChannel}:europe-west1`;
  }

  getPaymentGateway(): string {
    return tenant3Config.paymentGateway;
  }
}
