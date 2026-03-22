import type { TenantId } from "../../shared/types/index.js";

export interface InitiatePaymentRequest {
  orderId: string;
  amount: number;
  currency: string;
  paymentMethod: "card" | "bank_transfer" | "wallet";
}

export interface InitiatePaymentResponse {
  paymentId: string;
  tenantId: TenantId;
  gateway: string;
  status: "initiated" | "pending" | "failed";
  amount: number;
  currency: string;
  timestamp: string;
}

export interface PaymentHealthResponse {
  status: "ok";
  service: "payments";
  tenantId: TenantId;
  cloud: string;
  gateway: string;
  timestamp: string;
}
