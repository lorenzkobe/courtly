export const PAYMENT_PROOF_ALLOWED_INPUT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const PAYMENT_PROOF_CANONICAL_MIME_TYPE = "image/jpeg" as const;
export const PAYMENT_PROOF_RAW_MAX_BYTES = 10 * 1024 * 1024;
export const PAYMENT_PROOF_FINAL_MAX_BYTES = Math.floor(1.5 * 1024 * 1024);
export const PAYMENT_PROOF_MIN_SHORT_EDGE_PX = 720;
export const PAYMENT_PROOF_MAX_LONG_EDGE_PX = 3000;
export const PAYMENT_PROOF_TARGET_LONG_EDGE_PX = 1920;
export const PAYMENT_PROOF_JPEG_QUALITY_STEPS = [0.9, 0.84, 0.8] as const;
