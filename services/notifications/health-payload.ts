import { getAdapter } from "../../shared/adapters/factory/adapter.factory.js";
import type { NotificationHealthResponse } from "./types.js";

/** Pure health payload for the notifications service. No Encore import — safe to unit test. */
export function getNotificationsHealthPayload(): NotificationHealthResponse {
  const adapter = getAdapter();
  return {
    status: "ok",
    service: "notifications",
    tenantId: adapter.tenantId,
    cloud: adapter.cloud,
    channel: adapter.getNotificationChannel(),
    timestamp: new Date().toISOString(),
  };
}
