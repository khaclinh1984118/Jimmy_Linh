import { createClient } from "@/lib/supabase/server";

export const VIDEO_BUCKET =
  process.env.SUPABASE_VIDEO_BUCKET || "video-assets";

export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error("UNAUTHORIZED");
  }

  return { supabase, user: data.user };
}

export function decodeDataUrl(value: string) {
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new Error("Anh khong hop le.");

  return {
    mimeType: match[1],
    data: match[2],
    buffer: Buffer.from(match[2], "base64"),
  };
}

export async function uploadImageAsset(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  generationId: string,
  label: string,
  dataUrl: string,
) {
  const decoded = decodeDataUrl(dataUrl);
  const ext =
    decoded.mimeType === "image/jpeg"
      ? "jpg"
      : decoded.mimeType === "image/png"
        ? "png"
        : "webp";
  const path = userId + "/" + generationId + "/inputs/" + label + "." + ext;

  const { error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .upload(path, decoded.buffer, {
      contentType: decoded.mimeType,
      upsert: false,
    });

  if (error) throw new Error(error.message);
  return { path, mimeType: decoded.mimeType, data: decoded.data };
}

export async function signedVideoUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string | null,
) {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .createSignedUrl(path, 60 * 60);

  if (error) return null;
  return data.signedUrl;
}
