import { getAdapter } from "../../shared/adapters/factory/adapter.factory.js";
import type { PaymentHealthResponse } from "./types.js";

/** Pure health payload for the payments service. No Encore import — safe to unit test. */
export function getPaymentsHealthPayload(): PaymentHealthResponse {
  const adapter = getAdapter();
  return {
    status: "ok",
    service: "payments",
    tenantId: adapter.tenantId,
    cloud: adapter.cloud,
    gateway: adapter.getPaymentGateway(),
    timestamp: new Date().toISOString(),
  };
}
