import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPaymentsHealthPayload } from "../../services/payments/health-payload";

describe("payments health", () => {
  beforeEach(() => {
    process.env["TENANT"] = "tenant-1";
  });

  afterEach(() => {
    delete process.env["TENANT"];
  });

  it("returns stripe-us gateway for tenant-1", () => {
    process.env["TENANT"] = "tenant-1";
    const payload = getPaymentsHealthPayload();
    expect(payload.status).toBe("ok");
    expect(payload.service).toBe("payments");
    expect(payload.tenantId).toBe("tenant-1");
    expect(payload.gateway).toBe("stripe-us");
  });

  it("returns stripe-eu gateway for tenant-2", () => {
    process.env["TENANT"] = "tenant-2";
    const payload = getPaymentsHealthPayload();
    expect(payload.status).toBe("ok");
    expect(payload.tenantId).toBe("tenant-2");
    expect(payload.gateway).toBe("stripe-eu");
  });

  it("returns adyen-eu gateway for tenant-3", () => {
    process.env["TENANT"] = "tenant-3";
    const payload = getPaymentsHealthPayload();
    expect(payload.status).toBe("ok");
    expect(payload.tenantId).toBe("tenant-3");
    expect(payload.gateway).toBe("adyen-eu");
  });
});
