import {
  PAYMENT_PROOF_ALLOWED_INPUT_MIME_TYPES,
  PAYMENT_PROOF_CANONICAL_MIME_TYPE,
  PAYMENT_PROOF_FINAL_MAX_BYTES,
  PAYMENT_PROOF_JPEG_QUALITY_STEPS,
  PAYMENT_PROOF_MAX_LONG_EDGE_PX,
  PAYMENT_PROOF_MIN_SHORT_EDGE_PX,
  PAYMENT_PROOF_RAW_MAX_BYTES,
  PAYMENT_PROOF_TARGET_LONG_EDGE_PX,
} from "@/lib/payments/payment-proof-constraints";

type OptimizedPaymentProof = {
  dataUrl: string;
  mimeType: typeof PAYMENT_PROOF_CANONICAL_MIME_TYPE;
  bytes: number;
  width: number;
  height: number;
};

function bytesFromDataUrl(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

function readImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not decode image."));
      image.onload = () => resolve(image);
      image.src = String(reader.result ?? "");
    };
    reader.readAsDataURL(file);
  });
}

function scaleSize(width: number, height: number): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= PAYMENT_PROOF_TARGET_LONG_EDGE_PX) {
    return { width, height };
  }
  const scale = PAYMENT_PROOF_TARGET_LONG_EDGE_PX / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function optimizePaymentProofImage(file: File): Promise<OptimizedPaymentProof> {
  if (!PAYMENT_PROOF_ALLOWED_INPUT_MIME_TYPES.includes(file.type as never)) {
    throw new Error("Unsupported image format. Use JPEG, PNG, or WebP.");
  }
  if (file.size > PAYMENT_PROOF_RAW_MAX_BYTES) {
    throw new Error("Image is too large. Use a screenshot under 10 MB.");
  }

  const image = await readImage(file);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const shortEdge = Math.min(sourceWidth, sourceHeight);
  const longEdge = Math.max(sourceWidth, sourceHeight);
  if (shortEdge < PAYMENT_PROOF_MIN_SHORT_EDGE_PX || longEdge > PAYMENT_PROOF_MAX_LONG_EDGE_PX) {
    throw new Error(
      `Image is too small or too large. The shorter side must be at least ${PAYMENT_PROOF_MIN_SHORT_EDGE_PX}px and the longer side at most ${PAYMENT_PROOF_MAX_LONG_EDGE_PX}px (your image is ${sourceWidth}×${sourceHeight}px).`,
    );
  }

  const { width, height } = scaleSize(sourceWidth, sourceHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not prepare image optimizer.");
  }
  ctx.drawImage(image, 0, 0, width, height);

  for (const quality of PAYMENT_PROOF_JPEG_QUALITY_STEPS) {
    const dataUrl = canvas.toDataURL(PAYMENT_PROOF_CANONICAL_MIME_TYPE, quality);
    const bytes = bytesFromDataUrl(dataUrl);
    if (bytes <= PAYMENT_PROOF_FINAL_MAX_BYTES) {
      return {
        dataUrl,
        mimeType: PAYMENT_PROOF_CANONICAL_MIME_TYPE,
        bytes,
        width,
        height,
      };
    }
  }

  const fallback = canvas.toDataURL(PAYMENT_PROOF_CANONICAL_MIME_TYPE, 0.72);
  const fallbackBytes = bytesFromDataUrl(fallback);
  if (fallbackBytes > PAYMENT_PROOF_FINAL_MAX_BYTES) {
    throw new Error("Image is still too large after optimization.");
  }
  return {
    dataUrl: fallback,
    mimeType: PAYMENT_PROOF_CANONICAL_MIME_TYPE,
    bytes: fallbackBytes,
    width,
    height,
  };
}
