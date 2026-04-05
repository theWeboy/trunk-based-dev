import { api } from "encore.dev/api";
import { getAdapter } from "../../shared/adapters/factory/adapter.factory.js";
import type { ListOrdersResponse, Order } from "./types.js";

/** In-memory seed data for demonstration — one entry per tenant. */
const seedOrders: Order[] = [
  {
    id: "ord-seed-001",
    tenantId: "tenant-1",
    items: [{ productId: "p-001", quantity: 2, unitPrice: 49.99 }],
    currency: "USD",
    total: 99.98,
    status: "confirmed",
    createdAt: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "ord-seed-002",
    tenantId: "tenant-2",
    items: [{ productId: "p-002", quantity: 1, unitPrice: 99.0 }],
    currency: "EUR",
    total: 99.0,
    status: "confirmed",
    createdAt: "2025-01-02T00:00:00.000Z",
  },
  {
    id: "ord-seed-003",
    tenantId: "tenant-3",
    items: [{ productId: "p-003", quantity: 3, unitPrice: 15.0 }],
    currency: "GBP",
    total: 45.0,
    status: "confirmed",
    createdAt: "2025-01-03T00:00:00.000Z",
  },
];

export const listOrders = api<void, ListOrdersResponse>(
  { method: "GET", path: "/orders", expose: true },
  async (): Promise<ListOrdersResponse> => {
    const adapter = getAdapter();
    const tenantOrders = seedOrders.filter((o) => o.tenantId === adapter.tenantId);
    return {
      orders: tenantOrders,
      total: tenantOrders.length,
      tenantId: adapter.tenantId,
      timestamp: new Date().toISOString(),
    };
  }
);
