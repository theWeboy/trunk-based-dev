import { api } from "encore.dev/api";
import { getOrdersHealthPayload } from "./health-payload.js";
import type { OrderHealthResponse } from "./types.js";

export const ordersHealth = api<void, OrderHealthResponse>(
  { method: "GET", path: "/orders/health", expose: true },
  async (): Promise<OrderHealthResponse> => getOrdersHealthPayload()
);
