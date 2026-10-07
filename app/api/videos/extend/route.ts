import { NextResponse } from "next/server";
import { createVideoJob } from "@/lib/veo";
import { estimateCredits, getModelConfig, type ModelTier } from "@/lib/models";
import { requireUser } from "@/lib/studio";

export async function POST(request: Request) {
  let generationId: string | null = null;

  try {
    const { supabase, user } = await requireUser();
    const body = await request.json().catch(() => null);
    const parentGenerationId =
      typeof body?.parentGenerationId === "string" ? body.parentGenerationId : "";
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const tier = String(body?.modelTier ?? "fast") as ModelTier;

    if (!parentGenerationId || !prompt) {
      return NextResponse.json(
        { error: "Can video nguon va prompt noi tiep." },
        { status: 400 },
      );
    }

    if (tier === "lite") {
      return NextResponse.json(
        { error: "Veo Lite khong ho tro Extend Video." },
        { status: 400 },
      );
    }

    const model = getModelConfig(tier);
    if (!model.supportsExtend) {
      return NextResponse.json({ error: "Model khong ho tro Extend Video." }, { status: 400 });
    }

    const { data: parent, error: parentError } = await supabase
      .from("generations")
      .select("*")
      .eq("id", parentGenerationId)
      .eq("user_id", user.id)
      .single();

    if (parentError || !parent || parent.status !== "completed") {
      return NextResponse.json({ error: "Video nguon chua san sang." }, { status: 400 });
    }

    if (!parent.provider_video_uri) {
      return NextResponse.json(
        { error: "Video nay khong con provider URI de extend." },
        { status: 400 },
      );
    }

    const ageMs = Date.now() - new Date(parent.updated_at).getTime();
    if (ageMs > 47 * 60 * 60 * 1000) {
      return NextResponse.json(
        { error: "Google chi cho extend video Veo con provider reference trong khoang 2 ngay." },
        { status: 400 },
      );
    }

    const credits = estimateCredits(tier, "720p", 7);

    const { data: generation, error: insertError } = await supabase
      .from("generations")
      .insert({
        user_id: user.id,
        project_id: parent.project_id,
        parent_generation_id: parent.id,
        prompt,
        mode: "extend",
        model_tier: tier,
        model_id: model.model,
        status: "draft",
        aspect_ratio: parent.aspect_ratio,
        duration_seconds: 7,
        resolution: "720p",
      })
      .select("id")
      .single();

    if (insertError || !generation) {
      throw new Error(insertError?.message || "GENERATION_CREATE_FAILED");
    }

    generationId = generation.id as string;

    const { error: reserveError } = await supabase.rpc("reserve_generation_credits", {
      p_generation_id: generationId,
      p_amount: credits,
    });

    if (reserveError) {
      await supabase.from("generations").delete().eq("id", generationId);
      generationId = null;
      throw new Error(reserveError.message);
    }

    const job = await createVideoJob({
      model: model.model,
      prompt,
      aspectRatio: parent.aspect_ratio,
      duration: 7,
      resolution: "720p",
      extendVideoUri: parent.provider_video_uri,
    });

    await supabase
      .from("generations")
      .update({
        status: "queued",
        operation_name: job.operation,
        updated_at: new Date().toISOString(),
      })
      .eq("id", generationId);

    return NextResponse.json({
      generationId,
      operation: job.operation,
      status: "queued",
      creditsReserved: credits,
      message: "Da gui yeu cau extend them 7 giay.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Khong the extend video.";

    try {
      if (generationId) {
        const { supabase } = await requireUser();
        await supabase.rpc("refund_generation_credits", {
          p_generation_id: generationId,
        });
        await supabase
          .from("generations")
          .update({ status: "failed", error_message: message })
          .eq("id", generationId);
      }
    } catch {}

    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
