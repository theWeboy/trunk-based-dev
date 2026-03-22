import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => ({
  api: <TRequest, TResponse>(
    _meta: unknown,
    handler: (request: TRequest) => Promise<TResponse>,
  ) => handler,
  APIError: {
    invalidArgument: (message: string) => new Error(message),
  },
}));

import { health } from "../../services/api/health";
import { sendNotification } from "../../services/notifications/send";
import { notificationsHealth } from "../../services/notifications/health";
import { createOrder } from "../../services/orders/create";
import { ordersHealth } from "../../services/orders/health";
import { listOrders } from "../../services/orders/list";
import { paymentsHealth } from "../../services/payments/health";
import { initiatePayment } from "../../services/payments/initiate";

describe("service endpoints", () => {
  beforeEach(() => {
    process.env["TENANT"] = "tenant-1";
  });

  afterEach(() => {
    delete process.env["TENANT"];
  });

  it("returns api health payload from the exposed handler", async () => {
    const response = await health();
    expect(response.status).toBe("ok");
    expect(new Date(response.timestamp).toISOString()).toBe(response.timestamp);
  });

  it("creates an order for the current tenant", async () => {
    const response = await createOrder({
      items: [
        { productId: "p-1", quantity: 2, unitPrice: 10 },
        { productId: "p-2", quantity: 1, unitPrice: 5.5 },
      ],
      currency: "USD",
    });

    expect(response.tenantId).toBe("tenant-1");
    expect(response.order.id.startsWith("ord-")).toBe(true);
    expect(response.order.total).toBe(25.5);
    expect(response.order.status).toBe("confirmed");
    expect(response.order.tenantId).toBe("tenant-1");
  });

  it("rejects invalid orders", async () => {
    await expect(
      createOrder({
        items: [{ productId: "p-1", quantity: 1, unitPrice: 10 }],
        currency: "EUR",
      }),
    ).rejects.toThrow(/USD/);
  });

  it("lists only seed orders for the active tenant", async () => {
    process.env["TENANT"] = "tenant-2";

    const response = await listOrders();

    expect(response.tenantId).toBe("tenant-2");
    expect(response.total).toBe(1);
    expect(response.orders).toHaveLength(1);
    expect(response.orders[0]?.tenantId).toBe("tenant-2");
    expect(response.orders[0]?.id).toBe("ord-seed-002");
  });

  it("returns the orders health payload from the endpoint", async () => {
    const response = await ordersHealth();
    expect(response.service).toBe("orders");
    expect(response.tenantId).toBe("tenant-1");
  });

  it("queues a notification using the tenant channel", async () => {
    process.env["TENANT"] = "tenant-3";

    const response = await sendNotification({
      recipient: "demo@example.com",
      subject: "Subject",
      message: "Hello",
    });

    expect(response.notificationId.startsWith("notif-")).toBe(true);
    expect(response.tenantId).toBe("tenant-3");
    expect(response.channel).toContain("europe-west1");
    expect(response.status).toBe("queued");
  });

  it("returns the notifications health payload from the endpoint", async () => {
    process.env["TENANT"] = "tenant-2";

    const response = await notificationsHealth();

    expect(response.service).toBe("notifications");
    expect(response.channel).toContain("pubsub");
    expect(response.tenantId).toBe("tenant-2");
  });

  it("initiates a payment using the tenant gateway", async () => {
    process.env["TENANT"] = "tenant-3";

    const response = await initiatePayment({
      orderId: "ord-123",
      amount: 12.5,
      currency: "GBP",
      paymentMethod: "card",
    });

    expect(response.paymentId.startsWith("pay-")).toBe(true);
    expect(response.tenantId).toBe("tenant-3");
    expect(response.gateway).toBe("adyen-eu");
    expect(response.status).toBe("initiated");
  });

  it("rejects payments with non-positive amounts", async () => {
    await expect(
      initiatePayment({
        orderId: "ord-123",
        amount: 0,
        currency: "USD",
        paymentMethod: "card",
      }),
    ).rejects.toThrow(/greater than zero/);
  });

  it("returns the payments health payload from the endpoint", async () => {
    process.env["TENANT"] = "tenant-1";

    const response = await paymentsHealth();

    expect(response.service).toBe("payments");
    expect(response.gateway).toBe("stripe-us");
    expect(response.tenantId).toBe("tenant-1");
  });
});
