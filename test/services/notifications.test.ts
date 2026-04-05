import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getNotificationsHealthPayload } from "../../services/notifications/health-payload";

describe("notifications health", () => {
  beforeEach(() => {
    process.env.TENANT = "tenant-1";
  });

  afterEach(() => {
    delete process.env.TENANT;
  });

  it("returns sns channel for tenant-1 (AWS)", () => {
    process.env.TENANT = "tenant-1";
    const payload = getNotificationsHealthPayload();
    expect(payload.status).toBe("ok");
    expect(payload.service).toBe("notifications");
    expect(payload.tenantId).toBe("tenant-1");
    expect(payload.cloud).toBe("aws");
    expect(payload.channel).toContain("sns");
  });

  it("returns pubsub channel for tenant-2 (GCP)", () => {
    process.env.TENANT = "tenant-2";
    const payload = getNotificationsHealthPayload();
    expect(payload.status).toBe("ok");
    expect(payload.tenantId).toBe("tenant-2");
    expect(payload.cloud).toBe("gcp");
    expect(payload.channel).toContain("pubsub");
  });

  it("returns pubsub channel for tenant-3 (GCP)", () => {
    process.env.TENANT = "tenant-3";
    const payload = getNotificationsHealthPayload();
    expect(payload.status).toBe("ok");
    expect(payload.tenantId).toBe("tenant-3");
    expect(payload.cloud).toBe("gcp");
    expect(payload.channel).toContain("europe-west1");
  });
});
