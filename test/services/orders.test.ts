import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOrdersHealthPayload } from "../../services/orders/health-payload";

describe("orders health", () => {
  beforeEach(() => {
    process.env["TENANT"] = "tenant-1";
  });

  afterEach(() => {
    delete process.env["TENANT"];
  });

  it("returns status ok for tenant-1", () => {
    process.env["TENANT"] = "tenant-1";
    const payload = getOrdersHealthPayload();
    expect(payload.status).toBe("ok");
    expect(payload.service).toBe("orders");
    expect(payload.tenantId).toBe("tenant-1");
    expect(payload.cloud).toBe("aws");
    expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
  });

  it("returns status ok for tenant-2", () => {
    process.env["TENANT"] = "tenant-2";
    const payload = getOrdersHealthPayload();
    expect(payload.status).toBe("ok");
    expect(payload.tenantId).toBe("tenant-2");
    expect(payload.cloud).toBe("gcp");
  });

  it("returns status ok for tenant-3", () => {
    process.env["TENANT"] = "tenant-3";
    const payload = getOrdersHealthPayload();
    expect(payload.status).toBe("ok");
    expect(payload.tenantId).toBe("tenant-3");
    expect(payload.cloud).toBe("gcp");
  });
});
