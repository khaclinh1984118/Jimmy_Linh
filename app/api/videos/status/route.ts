import { NextResponse } from "next/server";
import { downloadVideo, getVideoJob } from "@/lib/veo";
import { requireUser, signedVideoUrl, VIDEO_BUCKET } from "@/lib/studio";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const url = new URL(request.url);
    const generationId = url.searchParams.get("generationId");

    if (!generationId) {
      return NextResponse.json({ error: "Thieu generationId." }, { status: 400 });
    }

    const { data: generation, error } = await supabase
      .from("generations")
      .select("*")
      .eq("id", generationId)
      .eq("user_id", user.id)
      .single();

    if (error || !generation) {
      return NextResponse.json({ error: "Generation not found." }, { status: 404 });
    }

    if (generation.status === "completed" && generation.video_storage_path) {
      return NextResponse.json({
        generationId,
        operation: generation.operation_name,
        status: "completed",
        message: "Video da duoc luu lau dai.",
        videoUrl: await signedVideoUrl(supabase, generation.video_storage_path),
      });
    }

    if (generation.status === "failed") {
      return NextResponse.json({
        generationId,
        operation: generation.operation_name,
        status: "failed",
        message: generation.error_message || "Generation failed.",
      });
    }

    if (!generation.operation_name) {
      return NextResponse.json({ error: "Generation chua co operation." }, { status: 409 });
    }

    const job = await getVideoJob(generation.operation_name);

    if (job.status === "processing") {
      await supabase
        .from("generations")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", generationId);

      return NextResponse.json({
        generationId,
        operation: generation.operation_name,
        ...job,
      });
    }

    if (job.status === "failed") {
      await supabase
        .from("generations")
        .update({
          status: "failed",
          error_message: job.error || job.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", generationId);

      await supabase.rpc("refund_generation_credits", {
        p_generation_id: generationId,
      });

      return NextResponse.json({
        generationId,
        operation: generation.operation_name,
        ...job,
      });
    }

    const source = await downloadVideo(job.providerVideoUri);
    const contentType = source.headers.get("content-type") || "video/mp4";
    const arrayBuffer = await source.arrayBuffer();
    const storagePath = user.id + "/" + generationId + "/output/video.mp4";

    const { error: uploadError } = await supabase.storage
      .from(VIDEO_BUCKET)
      .upload(storagePath, arrayBuffer, {
        contentType,
        upsert: true,
        cacheControl: "3600",
      });

    if (uploadError) throw new Error(uploadError.message);

    const { error: persistError } = await supabase
      .from("generations")
      .update({
        status: "completed",
        provider_video_uri: job.providerVideoUri,
        video_storage_path: storagePath,
        updated_at: new Date().toISOString(),
      })
      .eq("id", generationId);

    if (persistError) throw new Error(persistError.message);

    return NextResponse.json({
      generationId,
      operation: generation.operation_name,
      status: "completed",
      message: "Video da render va luu vao Supabase Storage.",
      videoUrl: await signedVideoUrl(supabase, storagePath),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Khong the kiem tra trang thai.";
    const status = message === "UNAUTHORIZED" ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
