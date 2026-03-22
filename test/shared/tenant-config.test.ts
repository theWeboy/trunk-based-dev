import { describe, expect, it } from "vitest";
import { getTenantConfig } from "../../shared/config/tenants/index";
import type { TenantId } from "../../shared/types/index";

describe("tenant config", () => {
  it("returns correct config for tenant-1 (AWS)", () => {
    const config = getTenantConfig("tenant-1");
    expect(config.tenantId).toBe("tenant-1");
    expect(config.cloud).toBe("aws");
    expect(config.region).toBe("us-east-1");
    expect(config.currency).toBe("USD");
    expect(config.notificationChannel).toBe("sns");
    expect(config.paymentGateway).toBe("stripe-us");
    expect(config.maxOrderItems).toBe(100);
    expect(config.featureFlags.advancedRoutingEnabled).toBe(true);
  });

  it("returns correct config for tenant-2 (GCP us-central1)", () => {
    const config = getTenantConfig("tenant-2");
    expect(config.tenantId).toBe("tenant-2");
    expect(config.cloud).toBe("gcp");
    expect(config.region).toBe("us-central1");
    expect(config.currency).toBe("EUR");
    expect(config.notificationChannel).toBe("pubsub");
    expect(config.paymentGateway).toBe("stripe-eu");
    expect(config.maxOrderItems).toBe(50);
    expect(config.featureFlags.multiCurrencyEnabled).toBe(true);
  });

  it("returns correct config for tenant-3 (GCP europe-west1)", () => {
    const config = getTenantConfig("tenant-3");
    expect(config.tenantId).toBe("tenant-3");
    expect(config.cloud).toBe("gcp");
    expect(config.region).toBe("europe-west1");
    expect(config.currency).toBe("GBP");
    expect(config.notificationChannel).toBe("pubsub");
    expect(config.paymentGateway).toBe("adyen-eu");
    expect(config.maxOrderItems).toBe(25);
    expect(config.featureFlags.webhooksEnabled).toBe(false);
  });

  it("all tenants have distinct tenantIds", () => {
    const ids = (["tenant-1", "tenant-2", "tenant-3"] as TenantId[]).map(
      (t) => getTenantConfig(t).tenantId,
    );
    expect(new Set(ids).size).toBe(3);
  });

  it("tenant-1 is aws, tenant-2 and tenant-3 are gcp", () => {
    expect(getTenantConfig("tenant-1").cloud).toBe("aws");
    expect(getTenantConfig("tenant-2").cloud).toBe("gcp");
    expect(getTenantConfig("tenant-3").cloud).toBe("gcp");
  });

  it("tenant-2 and tenant-3 have different regions", () => {
    const r2 = getTenantConfig("tenant-2").region;
    const r3 = getTenantConfig("tenant-3").region;
    expect(r2).not.toBe(r3);
  });

  it("throws for unknown tenant", () => {
    expect(() => getTenantConfig("unknown" as TenantId)).toThrow();
  });
});
