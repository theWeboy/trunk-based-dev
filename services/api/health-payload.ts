/** Pure health payload (no Encore import) for use in API and unit tests. */
export interface IHealthResponse {
  status: "ok";
  timestamp: string;
}

export function getHealthPayload(): IHealthResponse {
  return { status: "ok", timestamp: new Date().toISOString() };
}
