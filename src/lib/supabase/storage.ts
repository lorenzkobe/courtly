import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "payment-proofs";
const VENUE_PHOTOS_BUCKET = "venue-photos";

function venuePhotoStoragePath(publicUrl: string): string {
  const marker = "/object/public/venue-photos/";
  const idx = publicUrl.indexOf(marker);
  return idx >= 0 ? publicUrl.slice(idx + marker.length) : publicUrl;
}

export async function uploadPaymentProof(
  storagePath: string,
  dataUrl: string,
): Promise<string> {
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("Invalid data URL");
  const buffer = Buffer.from(base64, "base64");
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return storagePath;
}

export async function uploadVenuePhoto(storagePath: string, dataUrl: string): Promise<string> {
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("Invalid data URL");
  const buffer = Buffer.from(base64, "base64");
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(VENUE_PHOTOS_BUCKET)
    .upload(storagePath, buffer, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data } = supabase.storage.from(VENUE_PHOTOS_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function deleteVenuePhotos(publicUrls: string[]): Promise<void> {
  if (publicUrls.length === 0) return;
  const paths = publicUrls.map(venuePhotoStoragePath);
  const supabase = createSupabaseAdminClient();
  await supabase.storage.from(VENUE_PHOTOS_BUCKET).remove(paths);
}

export async function createPaymentProofSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl)
    throw new Error(`Signed URL failed: ${error?.message}`);
  return data.signedUrl;
}
