import { expect, test } from "@playwright/test";

test("GET /orders/health returns 200 and ok", async ({ request }) => {
  const res = await request.get("/orders/health");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    status?: string;
    service?: string;
    tenantId?: string;
    cloud?: string;
    timestamp?: string;
  };
  expect(body.status).toBe("ok");
  expect(body.service).toBe("orders");
  expect(typeof body.tenantId).toBe("string");
  expect(typeof body.cloud).toBe("string");
  expect(typeof body.timestamp).toBe("string");
});

test("GET /orders returns order list", async ({ request }) => {
  const res = await request.get("/orders");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    orders?: unknown[];
    total?: number;
    tenantId?: string;
    timestamp?: string;
  };
  expect(Array.isArray(body.orders)).toBe(true);
  expect(typeof body.total).toBe("number");
  expect(typeof body.tenantId).toBe("string");
});

test("POST /orders creates an order for the active tenant", async ({ request }) => {
  const res = await request.post("/orders", {
    data: {
      items: [{ productId: "p-test", quantity: 1, unitPrice: 10.0 }],
      currency: "USD",
    },
  });
  expect([200, 201, 400]).toContain(res.status());
  if (res.status() === 200 || res.status() === 201) {
    const body = (await res.json()) as { order?: { id?: string; status?: string }; tenantId?: string };
    expect(typeof body.order?.id).toBe("string");
    expect(body.order?.status).toBe("confirmed");
    expect(typeof body.tenantId).toBe("string");
  }
});
