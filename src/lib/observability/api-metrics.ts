type ApiMetricsInput = {
  route: string;
  duration_ms: number;
  limit?: number;
  cursor?: string | null;
  payload_bytes?: number;
  row_counts?: Record<string, number>;
};

export function logApiMetrics(input: ApiMetricsInput) {
  const payload = {
    route: input.route,
    duration_ms: Math.round(input.duration_ms),
    ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
    ...(input.cursor ? { cursor: input.cursor } : {}),
    ...(typeof input.payload_bytes === "number" ? { payload_bytes: input.payload_bytes } : {}),
    ...(input.row_counts ? { row_counts: input.row_counts } : {}),
  };
  console.info("[api-metrics]", JSON.stringify(payload));
}

export function payloadBytesOf(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return 0;
  }
}
