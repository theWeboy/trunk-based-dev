import { expect, test } from "@playwright/test";

test("GET /health returns 200 and ok", async ({ request }) => {
  const res = await request.get("/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty("status", "ok");
  expect(body).toHaveProperty("timestamp");
  expect(typeof (body as { timestamp?: string }).timestamp).toBe("string");
});
