import { APIError, api } from "encore.dev/api";
import { getAdapter } from "../../shared/adapters/factory/adapter.factory.js";
import type { InitiatePaymentRequest, InitiatePaymentResponse } from "./types.js";

export const initiatePayment = api<InitiatePaymentRequest, InitiatePaymentResponse>(
  { method: "POST", path: "/payments/initiate", expose: true },
  async (req: InitiatePaymentRequest): Promise<InitiatePaymentResponse> => {
    const adapter = getAdapter();

    if (req.amount <= 0) {
      throw APIError.invalidArgument("Payment amount must be greater than zero");
    }

    const gateway = adapter.getPaymentGateway();
    return {
      paymentId: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId: adapter.tenantId,
      gateway,
      status: "initiated",
      amount: req.amount,
      currency: req.currency,
      timestamp: new Date().toISOString(),
    };
  }
);
