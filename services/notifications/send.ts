import { api } from "encore.dev/api";
import { getAdapter } from "../../shared/adapters/factory/adapter.factory.js";
import type { SendNotificationRequest, SendNotificationResponse } from "./types.js";

export const sendNotification = api<SendNotificationRequest, SendNotificationResponse>(
  { method: "POST", path: "/notifications/send", expose: true },
  async (req: SendNotificationRequest): Promise<SendNotificationResponse> => {
    const adapter = getAdapter();
    const channel = adapter.getNotificationChannel();

    return {
      notificationId: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId: adapter.tenantId,
      channel,
      status: "queued",
      timestamp: new Date().toISOString(),
    };
  },
);
