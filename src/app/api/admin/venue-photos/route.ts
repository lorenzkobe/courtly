import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { deleteVenuePhotos, uploadVenuePhoto } from "@/lib/supabase/storage";
import { VENUE_PHOTO_FINAL_MAX_BYTES } from "@/lib/venues/venue-photo-constraints";

function bytesFromDataUrl(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

export async function POST(req: Request) {
  const user = await readSessionUser();
  if (user?.role !== "admin" && user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { data_url?: unknown };
  const dataUrl = body.data_url;

  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/jpeg;base64,")) {
    return NextResponse.json({ error: "Invalid image data." }, { status: 400 });
  }

  const bytes = bytesFromDataUrl(dataUrl);
  if (bytes > VENUE_PHOTO_FINAL_MAX_BYTES) {
    return NextResponse.json({ error: "Image exceeds maximum size after optimization." }, { status: 400 });
  }

  const storagePath = `${user.id}/${randomUUID()}.jpg`;
  const publicUrl = await uploadVenuePhoto(storagePath, dataUrl);
  return NextResponse.json({ public_url: publicUrl }, { status: 201 });
}

export async function DELETE(req: Request) {
  const user = await readSessionUser();
  if (user?.role !== "admin" && user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { public_urls?: unknown };
  const publicUrls = body.public_urls;

  if (!Array.isArray(publicUrls) || publicUrls.some((u) => typeof u !== "string")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  await deleteVenuePhotos(publicUrls as string[]);
  return NextResponse.json({});
}
