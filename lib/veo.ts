const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export type InputImage = {
  data: string;
  mimeType: string;
};

export type ReferenceImage = {
  image: InputImage;
  referenceType: "asset";
};

function getApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Thieu GEMINI_API_KEY.");
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
      "Google API HTTP " + response.status + ".";
    throw new Error(message);
  }

  return data;
}

function imagePayload(image: InputImage) {
  return {
    inlineData: {
      mimeType: image.mimeType,
      data: image.data,
    },
  };
}

export async function enhanceVideoPrompt(prompt: string) {
  const model = process.env.PROMPT_MODEL || "gemini-3.8-flash";
  const instruction =
    "Rewrite the user's idea into one concise cinematic video-generation prompt. " +
    "Preserve intent. Add subject, action, environment, shot type, camera motion, lighting, visual style, pacing, and useful audio cues. " +
    "Do not add extra explanation. Return only the enhanced English prompt.";

  const data = await googleRequest(
    BASE_URL + "/models/" + encodeURIComponent(model) + ":generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 500 },
      }),
    },
  );

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part?.text || "")
    .join("")
    .trim();

  if (!text) throw new Error("Khong nhan duoc prompt nang cap.");
  return text;
}

export async function createVideoJob(input: {
  model: string;
  prompt: string;
  aspectRatio: string;
  duration: number;
  resolution: string;
  firstFrame?: InputImage | null;
  lastFrame?: InputImage | null;
  referenceImages?: ReferenceImage[];
  extendVideoUri?: string | null;
}) {
  const instance: Record<string, unknown> = {
    prompt: input.prompt,
  };

  if (input.extendVideoUri) {
    instance.video = { uri: input.extendVideoUri };
  } else {
    if (input.firstFrame) instance.image = imagePayload(input.firstFrame);
    if (input.lastFrame) instance.lastFrame = imagePayload(input.lastFrame);
    if (input.referenceImages?.length) {
      instance.referenceImages = input.referenceImages.map((ref) => ({
        image: imagePayload(ref.image),
        referenceType: ref.referenceType,
      }));
    }
  }

  const parameters: Record<string, unknown> = {
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    numberOfVideos: 1,
  };

  if (!input.extendVideoUri) {
    parameters.durationSeconds = String(input.duration);
  }

  const data = await googleRequest(
    BASE_URL + "/models/" + encodeURIComponent(input.model) + ":predictLongRunning",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [instance],
        parameters,
      }),
    },
  );

  if (!data?.name) {
    throw new Error("Google video API khong tra ve operation name.");
  }

  return { operation: data.name };
}

export async function getVideoJob(operation: string) {
  if (!operation.startsWith("operations/")) {
    throw new Error("Operation khong hop le.");
  }

  const operationPath = operation
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  const data = await googleRequest(BASE_URL + "/" + operationPath);

  if (!data?.done) {
    return {
      status: "processing" as const,
      message: "Video dang render.",
    };
  }

  if (data?.error) {
    return {
      status: "failed" as const,
      message: data.error.message || "Video generation failed.",
      error: data.error.message || "Video generation failed.",
    };
  }

  const video =
    data?.response?.generateVideoResponse?.generatedSamples?.[0]?.video ||
    data?.response?.generatedVideos?.[0]?.video;

  const uri = video?.uri;

  if (!uri) {
    return {
      status: "failed" as const,
      message: "Job hoan tat nhung khong co video URI.",
      error: "Missing generated video URI",
    };
  }

  return {
    status: "completed" as const,
    message: "Video da tao xong.",
    providerVideoUri: uri as string,
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
    throw new Error("Video URL khong thuoc mien Google duoc phep.");
  }

  const response = await fetch(url, {
    headers: { "x-goog-api-key": getApiKey() },
    redirect: "follow",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Khong the tai video tu Google (HTTP " + response.status + ").");
  }

  return response;
}
