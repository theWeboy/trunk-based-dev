import { expect, test } from "@playwright/test";

test("GET /payments/health returns 200 and ok", async ({ request }) => {
  const res = await request.get("/payments/health");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    status?: string;
    service?: string;
    tenantId?: string;
    cloud?: string;
    gateway?: string;
    timestamp?: string;
  };
  expect(body.status).toBe("ok");
  expect(body.service).toBe("payments");
  expect(typeof body.tenantId).toBe("string");
  expect(typeof body.cloud).toBe("string");
  expect(typeof body.gateway).toBe("string");
});

test("POST /payments/initiate creates a payment", async ({ request }) => {
  const res = await request.post("/payments/initiate", {
    data: {
      orderId: "ord-e2e-001",
      amount: 99.99,
      currency: "USD",
      paymentMethod: "card",
    },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    paymentId?: string;
    tenantId?: string;
    gateway?: string;
    status?: string;
    amount?: number;
    currency?: string;
  };
  expect(typeof body.paymentId).toBe("string");
  expect(typeof body.tenantId).toBe("string");
  expect(body.status).toBe("initiated");
  expect(typeof body.gateway).toBe("string");
});

test("POST /payments/initiate rejects zero or negative amount", async ({ request }) => {
  const res = await request.post("/payments/initiate", {
    data: {
      orderId: "ord-e2e-002",
      amount: 0,
      currency: "USD",
      paymentMethod: "card",
    },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});
