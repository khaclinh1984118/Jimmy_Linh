import { NextResponse } from "next/server";
import { requireUser, signedVideoUrl } from "@/lib/studio";

export async function GET() {
  try {
    const { supabase, user } = await requireUser();

    let { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select("id,name,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (projectsError) throw new Error(projectsError.message);

    if (!projects?.length) {
      const { data, error } = await supabase
        .from("projects")
        .insert({ user_id: user.id, name: "My Studio" })
        .select("id,name,created_at")
        .single();

      if (error) throw new Error(error.message);
      projects = [data];
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("credits,monthly_used_credits,monthly_quota_credits,quota_period_start")
      .eq("id", user.id)
      .single();

    if (profileError) throw new Error(profileError.message);

    const { data: generations, error: generationError } = await supabase
      .from("generations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (generationError) throw new Error(generationError.message);

    const hydrated = await Promise.all(
      (generations || []).map(async (item) => ({
        ...item,
        videoUrl:
          item.status === "completed"
            ? await signedVideoUrl(supabase, item.video_storage_path)
            : null,
      })),
    );

    return NextResponse.json({
      user: { id: user.id, email: user.email },
      profile,
      projects,
      generations: hydrated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bootstrap failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!name || name.length > 100) {
      return NextResponse.json({ error: "Ten project khong hop le." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({ user_id: user.id, name })
      .select("id,name,created_at")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ project: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project create failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
