import { NextResponse } from "next/server";
import { createVideoJob } from "@/lib/veo";

const allowedRatios = new Set(["16:9", "9:16"]);
const allowedDurations = new Set([4, 6, 8]);
const allowedResolutions = new Set(["720p", "1080p", "4k"]);
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function parseDataUrl(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("data:image/")) return null;
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new Error("Ảnh phải là JPEG, PNG hoặc WebP.");

  const mimeType = match[1];
  const data = match[2];
  if (!allowedImageTypes.has(mimeType)) throw new Error("Định dạng ảnh không được hỗ trợ.");

  const approxBytes = Math.ceil((data.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) throw new Error("Ảnh đầu vào phải nhỏ hơn 4 MB.");

  return { mimeType, data };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return NextResponse.json({ error: "Prompt không hợp lệ." }, { status: 400 });
  }

  const aspectRatio = String(body.aspectRatio ?? "16:9");
  const duration = Number(body.duration ?? 8);
  const resolution = String(body.resolution ?? "720p");

  if (!allowedRatios.has(aspectRatio)) {
    return NextResponse.json({ error: "Tỉ lệ khung hình không hợp lệ." }, { status: 400 });
  }

  if (!allowedDurations.has(duration)) {
    return NextResponse.json({ error: "Thời lượng phải là 4, 6 hoặc 8 giây." }, { status: 400 });
  }

  if (!allowedResolutions.has(resolution)) {
    return NextResponse.json({ error: "Độ phân giải không hợp lệ." }, { status: 400 });
  }

  if ((resolution === "1080p" || resolution === "4k") && duration !== 8) {
    return NextResponse.json(
      { error: resolution + " yêu cầu thời lượng 8 giây." },
      { status: 400 },
    );
  }

  try {
    const image = parseDataUrl(body.imageDataUrl);

    const job = await createVideoJob({
      prompt: body.prompt.trim(),
      aspectRatio,
      duration,
      resolution,
      image,
    });

    return NextResponse.json(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể tạo video.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
