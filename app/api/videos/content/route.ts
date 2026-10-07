import { downloadVideo } from "@/lib/veo";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const uri = url.searchParams.get("uri");

  if (!uri) {
    return new Response("Thiếu video uri.", { status: 400 });
  }

  try {
    const source = await downloadVideo(uri);

    return new Response(source.body, {
      status: 200,
      headers: {
        "Content-Type": source.headers.get("content-type") || "video/mp4",
        "Content-Disposition": 'inline; filename="jimmy-ai-video.mp4"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể tải video.";
    return new Response(message, { status: 502 });
  }
}
