import { NextResponse } from "next/server";
import { enhanceVideoPrompt } from "@/lib/veo";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

  if (!prompt) {
    return NextResponse.json({ error: "Hãy nhập ý tưởng trước khi nâng cấp prompt." }, { status: 400 });
  }

  if (prompt.length > 4000) {
    return NextResponse.json({ error: "Prompt quá dài." }, { status: 400 });
  }

  try {
    const enhancedPrompt = await enhanceVideoPrompt(prompt);
    return NextResponse.json({ prompt: enhancedPrompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể nâng cấp prompt.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
