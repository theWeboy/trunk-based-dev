import type { CloudProvider, TenantId } from "../../types/index.js";

export interface OrderValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Base adapter interface. Each tenant implements this to provide
 * tenant-specific business logic while keeping service code generic.
 */
export interface IServiceAdapter {
  readonly tenantId: TenantId;
  readonly cloud: CloudProvider;

  /** Validates an order according to tenant-specific rules (e.g. max items, currency). */
  validateOrder(order: { items: unknown[]; currency: string }): OrderValidationResult;

  /** Returns the notification channel used by this tenant. */
  getNotificationChannel(): string;

  /** Returns the payment gateway identifier used by this tenant. */
  getPaymentGateway(): string;
}
