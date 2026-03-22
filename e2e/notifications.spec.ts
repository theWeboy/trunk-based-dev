import { expect, test } from "@playwright/test";

test("GET /notifications/health returns 200 and ok", async ({ request }) => {
  const res = await request.get("/notifications/health");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    status?: string;
    service?: string;
    tenantId?: string;
    cloud?: string;
    channel?: string;
    timestamp?: string;
  };
  expect(body.status).toBe("ok");
  expect(body.service).toBe("notifications");
  expect(typeof body.tenantId).toBe("string");
  expect(typeof body.cloud).toBe("string");
  expect(typeof body.channel).toBe("string");
});

test("POST /notifications/send queues a notification", async ({ request }) => {
  const res = await request.post("/notifications/send", {
    data: {
      recipient: "test@example.com",
      subject: "Test",
      message: "E2E notification test",
    },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    notificationId?: string;
    tenantId?: string;
    channel?: string;
    status?: string;
    timestamp?: string;
  };
  expect(typeof body.notificationId).toBe("string");
  expect(typeof body.tenantId).toBe("string");
  expect(body.status).toBe("queued");
  expect(typeof body.channel).toBe("string");
});
