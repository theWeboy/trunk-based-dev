import { describe, expect, it } from "vitest";
import { getHealthPayload } from "../services/api/health-payload";

describe("health", () => {
  it("getHealthPayload returns status ok and timestamp", () => {
    const payload = getHealthPayload();
    expect(payload.status).toBe("ok");
    expect(payload.timestamp).toBeDefined();
    expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
  });
});
