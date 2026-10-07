import { NextResponse } from "next/server";

const allowedRatios = new Set(["16:9", "9:16", "1:1"]);
const allowedDurations = new Set([5, 8, 10]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return NextResponse.json({ error: "Prompt không hợp lệ." }, { status: 400 });
  }

  if (!allowedRatios.has(body.aspectRatio) || !allowedDurations.has(body.duration)) {
    return NextResponse.json({ error: "Thông số video không hợp lệ." }, { status: 400 });
  }

  const id = crypto.randomUUID();

  return NextResponse.json({
    id,
    status: "queued",
    prompt: body.prompt.trim(),
    aspectRatio: body.aspectRatio,
    duration: body.duration,
    provider: process.env.VIDEO_PROVIDER ?? "mock",
    message: "Job đã được tạo. Bước tiếp theo là nối route này với API video thật.",
  });
}
