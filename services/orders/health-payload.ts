import { getAdapter } from "../../shared/adapters/factory/adapter.factory.js";
import type { OrderHealthResponse } from "./types.js";

/** Pure health payload for the orders service. No Encore import — safe to unit test. */
export function getOrdersHealthPayload(): OrderHealthResponse {
  const adapter = getAdapter();
  return {
    status: "ok",
    service: "orders",
    tenantId: adapter.tenantId,
    cloud: adapter.cloud,
    timestamp: new Date().toISOString(),
  };
}
