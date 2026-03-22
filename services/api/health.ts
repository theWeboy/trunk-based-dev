/**
 * Health endpoint for liveness and smoke tests.
 * GET /health — returns 200 with { status: "ok", timestamp: ISO8601 }
 */
import { api } from "encore.dev/api";
import { getHealthPayload, type IHealthResponse } from "./health-payload";

export const health = api<void, IHealthResponse>(
  { method: "GET", path: "/health", expose: true },
  async (): Promise<IHealthResponse> => getHealthPayload()
);
