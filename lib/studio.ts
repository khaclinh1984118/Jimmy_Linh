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

export async function createUploadTicket(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  fileName: string,
) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-90);
  const path =
    userId + "/uploads/" + crypto.randomUUID() + "-" + safeName;

  const { data, error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .createSignedUploadUrl(path);

  if (error) throw new Error(error.message);

  return {
    path,
    token: data.token,
  };
}

export async function loadImageAsset(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  path: string,
) {
  if (!path.startsWith(userId + "/")) {
    throw new Error("INVALID_ASSET_PATH");
  }

  const { data, error } = await supabase.storage.from(VIDEO_BUCKET).download(path);
  if (error || !data) throw new Error(error?.message || "Khong the doc anh.");

  const mimeType = data.type || "image/jpeg";
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    throw new Error("Dinh dang anh khong duoc ho tro.");
  }

  if (data.size > 4 * 1024 * 1024) {
    throw new Error("Anh phai nho hon 4 MB.");
  }

  const buffer = Buffer.from(await data.arrayBuffer());

  return {
    data: buffer.toString("base64"),
    mimeType,
  };
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
