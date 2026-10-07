import { NextResponse } from "next/server";
import { getVideoJob } from "@/lib/veo";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const operation = url.searchParams.get("operation");

  if (!operation) {
    return NextResponse.json({ error: "Thiếu operation." }, { status: 400 });
  }

  try {
    const job = await getVideoJob(operation);
    return NextResponse.json(job, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Không thể kiểm tra trạng thái.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
