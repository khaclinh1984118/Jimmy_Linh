export type ModelTier = "standard" | "fast" | "lite";

export const MODEL_CATALOG = {
  standard: {
    label: "Veo 3.1 Standard",
    model: process.env.VEO_STANDARD_MODEL || "veo-3.1-generate-preview",
    supports4k: true,
    supportsReferences: true,
    supportsExtend: true,
    rates: { "720p": 0.4, "1080p": 0.4, "4k": 0.6 },
  },
  fast: {
    label: "Veo 3.1 Fast",
    model: process.env.VEO_FAST_MODEL || "veo-3.1-fast-generate-preview",
    supports4k: true,
    supportsReferences: true,
    supportsExtend: true,
    rates: { "720p": 0.1, "1080p": 0.12, "4k": 0.3 },
  },
  lite: {
    label: "Veo 3.1 Lite",
    model: process.env.VEO_LITE_MODEL || "veo-3.1-lite-generate-preview",
    supports4k: false,
    supportsReferences: false,
    supportsExtend: false,
    rates: { "720p": 0.05, "1080p": 0.08, "4k": null },
  },
} as const;

export function getModelConfig(tier: ModelTier) {
  return MODEL_CATALOG[tier];
}

export function estimateCredits(
  tier: ModelTier,
  resolution: "720p" | "1080p" | "4k",
  seconds: number,
) {
  const rate = MODEL_CATALOG[tier].rates[resolution];
  if (rate === null) throw new Error("Model nay khong ho tro do phan giai da chon.");
  return Math.ceil(rate * seconds * 100);
}
