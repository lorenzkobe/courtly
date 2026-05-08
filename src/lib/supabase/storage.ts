import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "payment-proofs";

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
