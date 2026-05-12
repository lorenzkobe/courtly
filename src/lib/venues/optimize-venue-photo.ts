import {
  VENUE_PHOTO_ALLOWED_MIME_TYPES,
  VENUE_PHOTO_CANONICAL_MIME_TYPE,
  VENUE_PHOTO_FINAL_MAX_BYTES,
  VENUE_PHOTO_JPEG_QUALITY_STEPS,
  VENUE_PHOTO_RAW_MAX_BYTES,
  VENUE_PHOTO_TARGET_LONG_EDGE_PX,
} from "@/lib/venues/venue-photo-constraints";

type OptimizedVenuePhoto = {
  dataUrl: string;
  mimeType: typeof VENUE_PHOTO_CANONICAL_MIME_TYPE;
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
  if (longEdge <= VENUE_PHOTO_TARGET_LONG_EDGE_PX) {
    return { width, height };
  }
  const scale = VENUE_PHOTO_TARGET_LONG_EDGE_PX / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function optimizeVenuePhoto(file: File): Promise<OptimizedVenuePhoto> {
  if (!VENUE_PHOTO_ALLOWED_MIME_TYPES.includes(file.type as never)) {
    throw new Error("Unsupported image format. Use JPEG, PNG, or WebP.");
  }
  if (file.size > VENUE_PHOTO_RAW_MAX_BYTES) {
    throw new Error("Image is too large. Maximum 5 MB per photo.");
  }

  const image = await readImage(file);
  const { width, height } = scaleSize(image.naturalWidth, image.naturalHeight);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare image optimizer.");
  ctx.drawImage(image, 0, 0, width, height);

  for (const quality of VENUE_PHOTO_JPEG_QUALITY_STEPS) {
    const dataUrl = canvas.toDataURL(VENUE_PHOTO_CANONICAL_MIME_TYPE, quality);
    const bytes = bytesFromDataUrl(dataUrl);
    if (bytes <= VENUE_PHOTO_FINAL_MAX_BYTES) {
      return { dataUrl, mimeType: VENUE_PHOTO_CANONICAL_MIME_TYPE, bytes, width, height };
    }
  }

  const fallback = canvas.toDataURL(VENUE_PHOTO_CANONICAL_MIME_TYPE, 0.72);
  const fallbackBytes = bytesFromDataUrl(fallback);
  if (fallbackBytes > VENUE_PHOTO_FINAL_MAX_BYTES) {
    throw new Error("Image is still too large after optimization. Try a smaller photo.");
  }
  return {
    dataUrl: fallback,
    mimeType: VENUE_PHOTO_CANONICAL_MIME_TYPE,
    bytes: fallbackBytes,
    width,
    height,
  };
}
