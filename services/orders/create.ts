import { api, APIError } from "encore.dev/api";
import { getAdapter } from "../../shared/adapters/factory/adapter.factory.js";
import type { CreateOrderRequest, CreateOrderResponse, Order } from "./types.js";

export const createOrder = api<CreateOrderRequest, CreateOrderResponse>(
  { method: "POST", path: "/orders", expose: true },
  async (req: CreateOrderRequest): Promise<CreateOrderResponse> => {
    const adapter = getAdapter();
    const validation = adapter.validateOrder({ items: req.items, currency: req.currency });

    if (!validation.valid) {
      throw APIError.invalidArgument(validation.reason ?? "Order validation failed");
    }

    const total = req.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const order: Order = {
      id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId: adapter.tenantId,
      items: req.items,
      currency: req.currency,
      total,
      status: "confirmed",
      createdAt: new Date().toISOString(),
    };

    return {
      order,
      tenantId: adapter.tenantId,
      timestamp: new Date().toISOString(),
    };
  },
);
