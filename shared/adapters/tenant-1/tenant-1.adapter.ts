import { tenant1Config } from "../../config/tenants/index.js";
import type { IServiceAdapter, OrderValidationResult } from "../base/service.adapter.js";

/**
 * Adapter for tenant-1 (AWS, us-east-1).
 * - Notification via AWS SNS pattern
 * - Payment via Stripe US
 * - Max 100 items per order
 */
export class Tenant1Adapter implements IServiceAdapter {
  readonly tenantId = tenant1Config.tenantId;
  readonly cloud = tenant1Config.cloud;

  validateOrder(order: { items: unknown[]; currency: string }): OrderValidationResult {
    if (order.items.length > tenant1Config.maxOrderItems) {
      return {
        valid: false,
        reason: `tenant-1 allows max ${tenant1Config.maxOrderItems} items per order`,
      };
    }
    if (order.currency !== tenant1Config.currency) {
      return {
        valid: false,
        reason: `tenant-1 only accepts ${tenant1Config.currency}`,
      };
    }
    return { valid: true };
  }

  getNotificationChannel(): string {
    return `aws-${tenant1Config.notificationChannel}:us-east-1`;
  }

  getPaymentGateway(): string {
    return tenant1Config.paymentGateway;
  }
}
