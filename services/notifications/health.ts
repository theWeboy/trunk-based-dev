import { api } from "encore.dev/api";
import { getNotificationsHealthPayload } from "./health-payload.js";
import type { NotificationHealthResponse } from "./types.js";

export const notificationsHealth = api<void, NotificationHealthResponse>(
  { method: "GET", path: "/notifications/health", expose: true },
  async (): Promise<NotificationHealthResponse> => getNotificationsHealthPayload(),
);
