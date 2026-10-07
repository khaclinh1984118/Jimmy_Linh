import { NextResponse } from "next/server";
import { createUploadTicket, requireUser } from "@/lib/studio";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await request.json().catch(() => null);
    const fileName =
      typeof body?.fileName === "string" ? body.fileName : "image.jpg";

    const ticket = await createUploadTicket(supabase, user.id, fileName);
    return NextResponse.json(ticket);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload ticket failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
