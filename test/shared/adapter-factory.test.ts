import { afterEach, describe, expect, it } from "vitest";
import { getAdapter } from "../../shared/adapters/factory/adapter.factory";
import type { TenantId } from "../../shared/types/index";

describe("adapter factory", () => {
  afterEach(() => {
    delete process.env["TENANT"];
  });

  it("returns tenant-1 adapter (AWS) when tenantId is passed explicitly", () => {
    const adapter = getAdapter("tenant-1");
    expect(adapter.tenantId).toBe("tenant-1");
    expect(adapter.cloud).toBe("aws");
  });

  it("returns tenant-2 adapter (GCP) when tenantId is passed explicitly", () => {
    const adapter = getAdapter("tenant-2");
    expect(adapter.tenantId).toBe("tenant-2");
    expect(adapter.cloud).toBe("gcp");
  });

  it("returns tenant-3 adapter (GCP) when tenantId is passed explicitly", () => {
    const adapter = getAdapter("tenant-3");
    expect(adapter.tenantId).toBe("tenant-3");
    expect(adapter.cloud).toBe("gcp");
  });

  it("reads tenant from TENANT env var when no tenantId is passed", () => {
    process.env["TENANT"] = "tenant-2";
    const adapter = getAdapter();
    expect(adapter.tenantId).toBe("tenant-2");
  });

  it("falls back to tenant-1 when TENANT is not set", () => {
    delete process.env["TENANT"];
    const adapter = getAdapter();
    expect(adapter.tenantId).toBe("tenant-1");
  });

  it("tenant-1 validates USD orders up to 100 items", () => {
    const adapter = getAdapter("tenant-1");
    expect(adapter.validateOrder({ items: Array(100).fill({}), currency: "USD" }).valid).toBe(true);
  });

  it("tenant-1 rejects orders over 100 items", () => {
    const adapter = getAdapter("tenant-1");
    const result = adapter.validateOrder({ items: Array(101).fill({}), currency: "USD" });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("100");
  });

  it("tenant-1 rejects non-USD currency", () => {
    const adapter = getAdapter("tenant-1");
    const result = adapter.validateOrder({ items: [{}], currency: "EUR" });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("USD");
  });

  it("tenant-2 allows EUR, USD, GBP currencies", () => {
    const adapter = getAdapter("tenant-2");
    for (const currency of ["EUR", "USD", "GBP"]) {
      expect(adapter.validateOrder({ items: [{}], currency }).valid).toBe(true);
    }
  });

  it("tenant-2 rejects orders over 50 items", () => {
    const adapter = getAdapter("tenant-2");
    const result = adapter.validateOrder({ items: Array(51).fill({}), currency: "EUR" });
    expect(result.valid).toBe(false);
  });

  it("tenant-3 rejects orders over 25 items (EU compliance)", () => {
    const adapter = getAdapter("tenant-3");
    const result = adapter.validateOrder({ items: Array(26).fill({}), currency: "GBP" });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("25");
  });

  it("tenant-3 only accepts GBP and EUR", () => {
    const adapter = getAdapter("tenant-3");
    expect(adapter.validateOrder({ items: [{}], currency: "GBP" }).valid).toBe(true);
    expect(adapter.validateOrder({ items: [{}], currency: "EUR" }).valid).toBe(true);
    expect(adapter.validateOrder({ items: [{}], currency: "USD" }).valid).toBe(false);
  });

  it("notification channels differ per tenant", () => {
    const channels = (["tenant-1", "tenant-2", "tenant-3"] as TenantId[]).map(
      (t) => getAdapter(t).getNotificationChannel(),
    );
    expect(new Set(channels).size).toBe(3);
  });

  it("payment gateways differ per tenant", () => {
    const gateways = (["tenant-1", "tenant-2", "tenant-3"] as TenantId[]).map(
      (t) => getAdapter(t).getPaymentGateway(),
    );
    expect(gateways[0]).toBe("stripe-us");
    expect(gateways[1]).toBe("stripe-eu");
    expect(gateways[2]).toBe("adyen-eu");
  });
});
