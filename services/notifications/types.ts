import type { TenantId } from "../../shared/types/index.js";

export interface SendNotificationRequest {
  recipient: string;
  subject: string;
  message: string;
}

export interface SendNotificationResponse {
  notificationId: string;
  tenantId: TenantId;
  channel: string;
  status: "sent" | "queued";
  timestamp: string;
}

export interface NotificationHealthResponse {
  status: "ok";
  service: "notifications";
  tenantId: TenantId;
  cloud: string;
  channel: string;
  timestamp: string;
}
