import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNodeEnv,
  getRegion,
  getTenant,
  getTenantOrDefault,
  isProduction,
} from "../../shared/utils/env";
import { logger } from "../../shared/utils/logger";

describe("env utilities", () => {
  afterEach(() => {
    delete process.env["TENANT"];
    delete process.env["NODE_ENV"];
    delete process.env["REGION"];
  });

  it("returns the configured tenant", () => {
    process.env["TENANT"] = "tenant-2";
    expect(getTenant()).toBe("tenant-2");
  });

  it("throws when TENANT is missing", () => {
    expect(() => getTenant()).toThrow(/TENANT environment variable is not set/);
  });

  it("throws when TENANT is invalid", () => {
    process.env["TENANT"] = "tenant-99";
    expect(() => getTenant()).toThrow(/Invalid TENANT/);
  });

  it("returns the fallback tenant for missing or invalid values", () => {
    expect(getTenantOrDefault("tenant-3")).toBe("tenant-3");

    process.env["TENANT"] = "invalid";
    expect(getTenantOrDefault("tenant-2")).toBe("tenant-2");
  });

  it("reads NODE_ENV and REGION with sensible defaults", () => {
    expect(getNodeEnv()).toBe("development");
    expect(getRegion()).toBe("local");

    process.env["NODE_ENV"] = "production";
    process.env["REGION"] = "us-east-1";

    expect(getNodeEnv()).toBe("production");
    expect(getRegion()).toBe("us-east-1");
    expect(isProduction()).toBe(true);
  });
});

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env["TENANT"];
    delete process.env["NODE_ENV"];
  });

  it("writes debug/info logs to console.log with tenant metadata", () => {
    process.env["TENANT"] = "tenant-1";
    process.env["NODE_ENV"] = "development";

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.info("hello", { requestId: "req-1" });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(payload["level"]).toBe("info");
    expect(payload["message"]).toBe("hello");
    expect(payload["tenant"]).toBe("tenant-1");
    expect(payload["env"]).toBe("development");
    expect(payload["requestId"]).toBe("req-1");
  });

  it("writes warn/error logs to console.error", () => {
    process.env["TENANT"] = "tenant-2";

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logger.warn("careful");
    logger.error("boom", { code: "E_FAIL" });

    expect(errorSpy).toHaveBeenCalledTimes(2);
    const warnPayload = JSON.parse(errorSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    const errorPayload = JSON.parse(errorSpy.mock.calls[1]?.[0] as string) as Record<string, unknown>;
    expect(warnPayload["level"]).toBe("warn");
    expect(errorPayload["level"]).toBe("error");
    expect(errorPayload["code"]).toBe("E_FAIL");
  });
});
