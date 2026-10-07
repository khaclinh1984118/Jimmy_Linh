import { NextResponse } from "next/server";
import { createVideoJob } from "@/lib/veo";
import { estimateCredits, getModelConfig, type ModelTier } from "@/lib/models";
import { loadImageAsset, requireUser } from "@/lib/studio";

const allowedRatios = new Set(["16:9", "9:16"]);
const allowedDurations = new Set([4, 6, 8]);
const allowedResolutions = new Set(["720p", "1080p", "4k"]);
const allowedTiers = new Set(["standard", "fast", "lite"]);

async function ensureProject(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  projectId?: string | null,
) {
  if (projectId) {
    const { data, error } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single();

    if (error || !data) throw new Error("PROJECT_NOT_FOUND");
    return data.id as string;
  }

  const { data: existing } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: userId, name: "My Studio" })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message || "PROJECT_CREATE_FAILED");
  return data.id as string;
}

export async function POST(request: Request) {
  let generationId: string | null = null;

  try {
    const { supabase, user } = await requireUser();
    const body = await request.json().catch(() => null);

    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const aspectRatio = String(body?.aspectRatio ?? "16:9");
    const duration = Number(body?.duration ?? 8);
    const resolution = String(body?.resolution ?? "720p") as "720p" | "1080p" | "4k";
    const tier = String(body?.modelTier ?? "fast") as ModelTier;
    const firstFramePath =
      typeof body?.firstFramePath === "string" ? body.firstFramePath : null;
    const lastFramePath =
      typeof body?.lastFramePath === "string" ? body.lastFramePath : null;
    const referencePaths = Array.isArray(body?.referencePaths)
      ? body.referencePaths.filter((x: unknown) => typeof x === "string").slice(0, 3)
      : [];

    if (!prompt) {
      return NextResponse.json({ error: "Prompt khong hop le." }, { status: 400 });
    }

    if (!allowedRatios.has(aspectRatio)) {
      return NextResponse.json({ error: "Ti le khung hinh khong hop le." }, { status: 400 });
    }

    if (!allowedDurations.has(duration)) {
      return NextResponse.json({ error: "Thoi luong phai la 4, 6 hoac 8 giay." }, { status: 400 });
    }

    if (!allowedResolutions.has(resolution)) {
      return NextResponse.json({ error: "Do phan giai khong hop le." }, { status: 400 });
    }

    if (!allowedTiers.has(tier)) {
      return NextResponse.json({ error: "Model tier khong hop le." }, { status: 400 });
    }

    const model = getModelConfig(tier);

    if (resolution === "4k" && !model.supports4k) {
      return NextResponse.json({ error: "Veo Lite khong ho tro 4K." }, { status: 400 });
    }

    if ((resolution === "1080p" || resolution === "4k") && duration !== 8) {
      return NextResponse.json({ error: resolution + " yeu cau video 8 giay." }, { status: 400 });
    }

    if (lastFramePath && !firstFramePath) {
      return NextResponse.json({ error: "Last frame can co first frame." }, { status: 400 });
    }

    if ((lastFramePath || referencePaths.length > 0) && duration !== 8) {
      return NextResponse.json(
        { error: "Interpolation va reference images yeu cau thoi luong 8 giay." },
        { status: 400 },
      );
    }

    if (referencePaths.length > 0 && !model.supportsReferences) {
      return NextResponse.json(
        { error: "Model Lite khong ho tro reference images." },
        { status: 400 },
      );
    }

    if (referencePaths.length > 0 && (firstFramePath || lastFramePath)) {
      return NextResponse.json(
        { error: "Hay chon reference images hoac first/last frame, khong dung dong thoi." },
        { status: 400 },
      );
    }

    const projectId = await ensureProject(
      supabase,
      user.id,
      typeof body?.projectId === "string" ? body.projectId : null,
    );

    const mode =
      referencePaths.length > 0
        ? "reference"
        : lastFramePath
          ? "interpolation"
          : firstFramePath
            ? "image-to-video"
            : "text-to-video";

    const credits = estimateCredits(tier, resolution, duration);

    const { data: generation, error: insertError } = await supabase
      .from("generations")
      .insert({
        user_id: user.id,
        project_id: projectId,
        prompt,
        mode,
        model_tier: tier,
        model_id: model.model,
        status: "draft",
        aspect_ratio: aspectRatio,
        duration_seconds: duration,
        resolution,
        source_storage_path: firstFramePath,
        last_frame_storage_path: lastFramePath,
        reference_storage_paths: referencePaths,
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

    const firstFrame = firstFramePath
      ? await loadImageAsset(supabase, user.id, firstFramePath)
      : null;
    const lastFrame = lastFramePath
      ? await loadImageAsset(supabase, user.id, lastFramePath)
      : null;
    const referenceImages = [];

    for (const path of referencePaths) {
      const image = await loadImageAsset(supabase, user.id, path);
      referenceImages.push({ image, referenceType: "asset" as const });
    }

    const job = await createVideoJob({
      model: model.model,
      prompt,
      aspectRatio,
      duration,
      resolution,
      firstFrame,
      lastFrame,
      referenceImages,
    });

    const { error: updateError } = await supabase
      .from("generations")
      .update({
        status: "queued",
        operation_name: job.operation,
        updated_at: new Date().toISOString(),
      })
      .eq("id", generationId);

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({
      generationId,
      projectId,
      operation: job.operation,
      status: "queued",
      creditsReserved: credits,
      message: "Da gui job toi " + model.label + ".",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Khong the tao video.";

    try {
      if (generationId) {
        const { supabase } = await requireUser();
        await supabase.rpc("refund_generation_credits", {
          p_generation_id: generationId,
        });
        await supabase
          .from("generations")
          .update({
            status: "failed",
            error_message: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", generationId);
      }
    } catch {
      // Preserve the original generation error.
    }

    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
