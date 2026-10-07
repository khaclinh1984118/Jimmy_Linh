const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function getApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Thiếu GEMINI_API_KEY. Hãy thêm key vào .env.local hoặc biến môi trường khi deploy.");
  }
  return apiKey;
}

async function googleRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "x-goog-api-key": getApiKey(),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      "Google Veo API trả về lỗi HTTP " + response.status + ".";
    throw new Error(message);
  }

  return data;
}

export async function createVideoJob(input: {
  prompt: string;
  aspectRatio: string;
  duration: number;
  resolution: string;
}) {
  const model = process.env.VEO_MODEL || "veo-3.1-generate-preview";

  const data = await googleRequest(
    BASE_URL + "/models/" + encodeURIComponent(model) + ":predictLongRunning",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: input.prompt }],
        parameters: {
          aspectRatio: input.aspectRatio,
          durationSeconds: String(input.duration),
          resolution: input.resolution,
          numberOfVideos: 1,
        },
      }),
    },
  );

  if (!data?.name) {
    throw new Error("Google Veo không trả về operation name.");
  }

  return {
    operation: data.name,
    status: "queued" as const,
    message: "Đã gửi yêu cầu tới Veo 3.1. Hệ thống sẽ tự kiểm tra tiến trình.",
  };
}

export async function getVideoJob(operation: string) {
  if (!operation.startsWith("operations/")) {
    throw new Error("Operation không hợp lệ.");
  }

  const operationPath = operation
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  const data = await googleRequest(BASE_URL + "/" + operationPath);

  if (!data?.done) {
    return {
      operation,
      status: "processing" as const,
      message: "Veo đang render video. Tiến trình có thể mất vài phút.",
    };
  }

  if (data?.error) {
    return {
      operation,
      status: "failed" as const,
      message: data.error.message || "Veo không thể hoàn tất video.",
      error: data.error.message || "Video generation failed",
    };
  }

  const video =
    data?.response?.generateVideoResponse?.generatedSamples?.[0]?.video ||
    data?.response?.generatedVideos?.[0]?.video;

  const uri = video?.uri;

  if (!uri) {
    return {
      operation,
      status: "failed" as const,
      message: "Job đã hoàn tất nhưng không tìm thấy URL video trong phản hồi.",
      error: "Missing generated video URI",
    };
  }

  return {
    operation,
    status: "completed" as const,
    message: "Video đã tạo xong.",
    videoUrl: "/api/videos/content?uri=" + encodeURIComponent(uri),
  };
}

export async function downloadVideo(uri: string) {
  const url = new URL(uri);

  const allowed =
    url.protocol === "https:" &&
    (url.hostname === "generativelanguage.googleapis.com" ||
      url.hostname === "storage.googleapis.com" ||
      url.hostname.endsWith(".googleapis.com"));

  if (!allowed) {
    throw new Error("Video URL không thuộc miền Google được phép.");
  }

  const response = await fetch(url, {
    headers: {
      "x-goog-api-key": getApiKey(),
    },
    redirect: "follow",
    cache: "no-store",
  });

  if (!response.ok || !response.body) {
    throw new Error("Không thể tải video từ Google (HTTP " + response.status + ").");
  }

  return response;
}
