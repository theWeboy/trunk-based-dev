import { api } from "encore.dev/api";
import { getPaymentsHealthPayload } from "./health-payload.js";
import type { PaymentHealthResponse } from "./types.js";

export const paymentsHealth = api<void, PaymentHealthResponse>(
  { method: "GET", path: "/payments/health", expose: true },
  async (): Promise<PaymentHealthResponse> => getPaymentsHealthPayload(),
);
