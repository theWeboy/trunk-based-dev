import { tenant2Config } from "../../config/tenants/index.js";
import type { IServiceAdapter, OrderValidationResult } from "../base/service.adapter.js";

/**
 * Adapter for tenant-2 (GCP, us-central1).
 * - Notification via GCP Pub/Sub pattern
 * - Payment via Stripe EU
 * - Max 50 items per order; multi-currency enabled
 */
export class Tenant2Adapter implements IServiceAdapter {
  readonly tenantId = tenant2Config.tenantId;
  readonly cloud = tenant2Config.cloud;

  validateOrder(order: { items: unknown[]; currency: string }): OrderValidationResult {
    if (order.items.length > tenant2Config.maxOrderItems) {
      return {
        valid: false,
        reason: `tenant-2 allows max ${tenant2Config.maxOrderItems} items per order`,
      };
    }
    const supportedCurrencies = ["EUR", "USD", "GBP"];
    if (!supportedCurrencies.includes(order.currency)) {
      return {
        valid: false,
        reason: `tenant-2 supports currencies: ${supportedCurrencies.join(", ")}`,
      };
    }
    return { valid: true };
  }

  getNotificationChannel(): string {
    return `gcp-${tenant2Config.notificationChannel}:us-central1`;
  }

  getPaymentGateway(): string {
    return tenant2Config.paymentGateway;
  }
}
