"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "draft" | "queued" | "processing" | "completed" | "failed";
type ModelTier = "standard" | "fast" | "lite";

type Project = { id: string; name: string; created_at: string };
type Profile = {
  credits: number;
  monthly_used_credits: number;
  monthly_quota_credits: number;
  quota_period_start: string;
};

type Generation = {
  id: string;
  project_id: string | null;
  prompt: string;
  mode: string;
  model_tier: ModelTier;
  model_id: string;
  status: Status;
  operation_name: string | null;
  aspect_ratio: string;
  duration_seconds: number;
  resolution: string;
  credits_reserved: number;
  video_storage_path: string | null;
  provider_video_uri: string | null;
  parent_generation_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  videoUrl?: string | null;
};

type Asset = {
  path: string;
  preview: string;
  name: string;
};

type ActiveJob = {
  generationId: string;
  operation?: string | null;
  status: Status;
  message: string;
  videoUrl?: string | null;
};

const BUCKET = "video-assets";

const modelMeta: Record<ModelTier, {
  name: string;
  note: string;
  supports4k: boolean;
  supportsReferences: boolean;
  supportsExtend: boolean;
}> = {
  standard: {
    name: "Veo 3.1 Standard",
    note: "Highest quality",
    supports4k: true,
    supportsReferences: true,
    supportsExtend: true,
  },
  fast: {
    name: "Veo 3.1 Fast",
    note: "Best default",
    supports4k: true,
    supportsReferences: true,
    supportsExtend: true,
  },
  lite: {
    name: "Veo 3.1 Lite",
    note: "Lowest cost",
    supports4k: false,
    supportsReferences: false,
    supportsExtend: false,
  },
};

const rates: Record<ModelTier, Record<"720p" | "1080p" | "4k", number | null>> = {
  standard: { "720p": 0.4, "1080p": 0.4, "4k": 0.6 },
  fast: { "720p": 0.1, "1080p": 0.12, "4k": 0.3 },
  lite: { "720p": 0.05, "1080p": 0.08, "4k": null },
};

function statusLabel(status: Status) {
  if (status === "queued") return "Queued";
  if (status === "processing") return "Rendering";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  return "Draft";
}

function filePreview(file: File) {
  return URL.createObjectURL(file);
}

export default function HomePage() {
  const supabase = createClient();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [view, setView] = useState<"create" | "library">("create");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [email, setEmail] = useState("");

  const [prompt, setPrompt] = useState("");
  const [extendPrompt, setExtendPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration] = useState("8");
  const [resolution, setResolution] = useState<"720p" | "1080p" | "4k">("720p");
  const [modelTier, setModelTier] = useState<ModelTier>("fast");

  const [firstFrame, setFirstFrame] = useState<Asset | null>(null);
  const [lastFrame, setLastFrame] = useState<Asset | null>(null);
  const [references, setReferences] = useState<Asset[]>([]);

  const [job, setJob] = useState<ActiveJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadStudio();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      [firstFrame, lastFrame, ...references].forEach((asset) => {
        if (asset?.preview) URL.revokeObjectURL(asset.preview);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadStudio() {
    const response = await fetch("/api/studio", { cache: "no-store" });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load studio.");

    setProfile(data.profile);
    setProjects(data.projects || []);
    setGenerations(data.generations || []);
    setEmail(data.user?.email || "");

    if (!selectedProject && data.projects?.[0]?.id) {
      setSelectedProject(data.projects[0].id);
    }
  }

  const estimatedCredits = useMemo(() => {
    const rate = rates[modelTier][resolution];
    if (rate === null) return null;
    return Math.ceil(rate * Number(duration) * 100);
  }, [duration, modelTier, resolution]);

  const quotaPercent = useMemo(() => {
    if (!profile || profile.monthly_quota_credits === 0) return 0;
    return Math.min(
      100,
      (profile.monthly_used_credits / profile.monthly_quota_credits) * 100,
    );
  }, [profile]);

  async function uploadAsset(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("Only JPEG, PNG and WebP images are supported.");
    }
    if (file.size > 4 * 1024 * 1024) {
      throw new Error("Each image must be under 4 MB.");
    }

    const ticketResponse = await fetch("/api/assets/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name }),
    });
    const ticket = await ticketResponse.json();

    if (!ticketResponse.ok) throw new Error(ticket.error || "Upload ticket failed.");

    const { error } = await supabase.storage
      .from(BUCKET)
      .uploadToSignedUrl(ticket.path, ticket.token, file, {
        contentType: file.type,
      });

    if (error) throw error;

    return {
      path: ticket.path as string,
      preview: filePreview(file),
      name: file.name,
    };
  }

  async function handleSingleAsset(
    event: ChangeEvent<HTMLInputElement>,
    setter: (asset: Asset | null) => void,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      setter(await uploadAsset(file));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function handleReferences(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).slice(0, 3);
    if (!files.length) return;

    setUploading(true);
    try {
      const uploaded: Asset[] = [];
      for (const file of files) uploaded.push(await uploadAsset(file));
      setReferences(uploaded);
      setFirstFrame(null);
      setLastFrame(null);
      setDuration("8");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function createProject() {
    const name = window.prompt("Project name");
    if (!name?.trim()) return;

    const response = await fetch("/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await response.json();

    if (!response.ok) {
      alert(data.error || "Could not create project.");
      return;
    }

    await loadStudio();
    setSelectedProject(data.project.id);
  }

  async function enhancePrompt() {
    if (!prompt.trim()) return;
    setEnhancing(true);

    try {
      const response = await fetch("/api/prompt/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not enhance prompt.");
      setPrompt(data.prompt);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Enhance failed.");
    } finally {
      setEnhancing(false);
    }
  }

  async function refreshStatus(generationId: string) {
    const response = await fetch(
      "/api/videos/status?generationId=" + encodeURIComponent(generationId),
      { cache: "no-store" },
    );
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Status check failed.");

    setJob({
      generationId,
      operation: data.operation,
      status: data.status,
      message: data.message,
      videoUrl: data.videoUrl,
    });

    if (data.status === "completed" || data.status === "failed") {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      await loadStudio();
    }

    return data;
  }

  function startPolling(generationId: string) {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(() => {
      refreshStatus(generationId).catch((error) => {
        setJob((current) =>
          current
            ? {
                ...current,
                message: error instanceof Error ? error.message : "Polling failed.",
              }
            : current,
        );
      });
    }, 10000);
  }

  async function generateVideo(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setJob(null);

    try {
      const response = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject || null,
          prompt,
          modelTier,
          aspectRatio,
          duration: Number(duration),
          resolution,
          firstFramePath: firstFrame?.path || null,
          lastFramePath: lastFrame?.path || null,
          referencePaths: references.map((x) => x.path),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Generation failed.");

      setJob({
        generationId: data.generationId,
        operation: data.operation,
        status: data.status,
        message: data.message,
      });

      await loadStudio();
      startPolling(data.generationId);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function extendCurrentVideo() {
    if (!job?.generationId || !extendPrompt.trim()) return;
    setBusy(true);

    try {
      const response = await fetch("/api/videos/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentGenerationId: job.generationId,
          prompt: extendPrompt,
          modelTier: modelTier === "lite" ? "fast" : modelTier,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Extend failed.");

      setJob({
        generationId: data.generationId,
        operation: data.operation,
        status: data.status,
        message: data.message,
      });

      setExtendPrompt("");
      await loadStudio();
      startPolling(data.generationId);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Extend failed.");
    } finally {
      setBusy(false);
    }
  }

  async function openGeneration(item: Generation) {
    setView("create");
    setPrompt(item.prompt);
    setSelectedProject(item.project_id || selectedProject);
    setModelTier(item.model_tier);
    setAspectRatio(item.aspect_ratio);
    setDuration(String(item.duration_seconds));
    setResolution(item.resolution as "720p" | "1080p" | "4k");
    setJob({
      generationId: item.id,
      operation: item.operation_name,
      status: item.status,
      message:
        item.status === "completed"
          ? "Saved in Supabase Storage."
          : "Loading latest status...",
      videoUrl: item.videoUrl,
    });

    if (item.status === "queued" || item.status === "processing") {
      await refreshStatus(item.id);
      startPolling(item.id);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function onModelChange(value: ModelTier) {
    setModelTier(value);

    if (value === "lite") {
      if (resolution === "4k") setResolution("1080p");
      setReferences([]);
    }
  }

  function enableInterpolation() {
    setReferences([]);
    setDuration("8");
  }

  function enableReferences() {
    setFirstFrame(null);
    setLastFrame(null);
    setDuration("8");
  }

  return (
    <main>
      <div className="studio-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">J</div>
            <div>
              <strong>Jimmy Studio</strong>
              <span>Production workspace</span>
            </div>
          </div>

          <nav>
            <button
              type="button"
              className={view === "create" ? "nav-button active" : "nav-button"}
              onClick={() => setView("create")}
            >
              <span>✦</span> Create
            </button>
            <button
              type="button"
              className={view === "library" ? "nav-button active" : "nav-button"}
              onClick={() => setView("library")}
            >
              <span>▦</span> Library
              <em>{generations.length}</em>
            </button>
          </nav>

          <div className="credit-card">
            <span>Credits</span>
            <strong>{profile?.credits ?? "—"}</strong>
            <small>100 credits ≈ $1 provider cost</small>
            <div className="quota-track">
              <div className="quota-fill" style={{ width: quotaPercent + "%" }} />
            </div>
            <small>
              {profile
                ? profile.monthly_used_credits + " / " + profile.monthly_quota_credits + " monthly"
                : "Loading quota..."}
            </small>
          </div>

          <div className="sidebar-user">
            <span>{email || "Signed in"}</span>
            <button type="button" onClick={signOut}>Sign out</button>
          </div>
        </aside>

        <section className="workspace">
          <div className="deprecation-banner">
            Veo 3.1 preview models are scheduled to retire on 22 Oct 2026.
            Model IDs are isolated in configuration so the studio can migrate without UI changes.
          </div>

          <header className="topbar">
            <div>
              <span className="eyebrow">AI VIDEO STUDIO</span>
              <h1>{view === "create" ? "Create & direct" : "Projects & generations"}</h1>
            </div>
            <div className="project-picker">
              <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <button type="button" className="ghost-button" onClick={createProject}>+ Project</button>
            </div>
          </header>

          {view === "create" ? (
            <div className="create-grid">
              <form className="studio-card composer" onSubmit={generateVideo}>
                <div className="section-heading">
                  <div>
                    <span className="step">01</span>
                    <h2>Model</h2>
                  </div>
                  <span className="mode-chip">{modelMeta[modelTier].note}</span>
                </div>

                <div className="model-grid">
                  {(Object.keys(modelMeta) as ModelTier[]).map((tier) => (
                    <button
                      type="button"
                      key={tier}
                      className={modelTier === tier ? "model-card selected" : "model-card"}
                      onClick={() => onModelChange(tier)}
                    >
                      <strong>{modelMeta[tier].name}</strong>
                      <small>{modelMeta[tier].note}</small>
                    </button>
                  ))}
                </div>

                <div className="section-heading prompt-heading">
                  <div>
                    <span className="step">02</span>
                    <h2>Prompt</h2>
                  </div>
                  <button
                    type="button"
                    className="enhance-button"
                    onClick={enhancePrompt}
                    disabled={enhancing || !prompt.trim()}
                  >
                    {enhancing ? "Enhancing..." : "✦ Enhance"}
                  </button>
                </div>

                <textarea
                  className="prompt-box"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe subject, action, camera, lighting, style and audio..."
                  required
                />

                <div className="section-heading settings-heading">
                  <div>
                    <span className="step">03</span>
                    <h2>Creative controls</h2>
                  </div>
                </div>

                <div className="advanced-tabs">
                  <div className="asset-panel">
                    <div className="asset-title">
                      <strong>First frame</strong>
                      <small>Image → video</small>
                    </div>
                    {firstFrame ? (
                      <div className="mini-preview">
                        <img src={firstFrame.preview} alt="" />
                        <button type="button" onClick={() => setFirstFrame(null)}>×</button>
                      </div>
                    ) : (
                      <label className="mini-upload" onClick={enableInterpolation}>
                        + Add first frame
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => handleSingleAsset(e, setFirstFrame)}
                        />
                      </label>
                    )}
                  </div>

                  <div className="asset-panel">
                    <div className="asset-title">
                      <strong>Last frame</strong>
                      <small>Interpolation</small>
                    </div>
                    {lastFrame ? (
                      <div className="mini-preview">
                        <img src={lastFrame.preview} alt="" />
                        <button type="button" onClick={() => setLastFrame(null)}>×</button>
                      </div>
                    ) : (
                      <label className="mini-upload" onClick={enableInterpolation}>
                        + Add last frame
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={!firstFrame}
                          onChange={(e) => handleSingleAsset(e, setLastFrame)}
                        />
                      </label>
                    )}
                  </div>

                  <div className="asset-panel reference-panel">
                    <div className="asset-title">
                      <strong>Reference images</strong>
                      <small>Up to 3 assets</small>
                    </div>

                    <div className="reference-strip">
                      {references.map((asset) => (
                        <img key={asset.path} src={asset.preview} alt="" />
                      ))}
                      <label
                        className={
                          modelMeta[modelTier].supportsReferences
                            ? "mini-upload"
                            : "mini-upload disabled"
                        }
                        onClick={enableReferences}
                      >
                        {references.length ? "Replace references" : "+ Add references"}
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/webp"
                          disabled={!modelMeta[modelTier].supportsReferences}
                          onChange={handleReferences}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="settings-grid">
                  <div>
                    <label>Frame</label>
                    <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                      <option value="16:9">16:9 · Landscape</option>
                      <option value="9:16">9:16 · Portrait</option>
                    </select>
                  </div>

                  <div>
                    <label>Duration</label>
                    <select
                      value={duration}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDuration(value);
                        if (
                          (resolution === "1080p" || resolution === "4k") &&
                          value !== "8"
                        ) {
                          setResolution("720p");
                        }
                      }}
                      disabled={Boolean(lastFrame || references.length)}
                    >
                      <option value="4">4 seconds</option>
                      <option value="6">6 seconds</option>
                      <option value="8">8 seconds</option>
                    </select>
                  </div>

                  <div>
                    <label>Resolution</label>
                    <select
                      value={resolution}
                      onChange={(e) => {
                        const value = e.target.value as "720p" | "1080p" | "4k";
                        setResolution(value);
                        if (value !== "720p") setDuration("8");
                      }}
                    >
                      <option value="720p">720p</option>
                      <option value="1080p">1080p · 8 sec</option>
                      {modelMeta[modelTier].supports4k && <option value="4k">4K · 8 sec</option>}
                    </select>
                  </div>
                </div>

                <div className="generate-bar">
                  <div>
                    <small>Estimated reservation</small>
                    <strong>
                      {estimatedCredits === null ? "Unsupported" : estimatedCredits + " credits"}
                    </strong>
                  </div>
                  <button
                    className="generate-button"
                    disabled={busy || uploading || !prompt.trim() || estimatedCredits === null}
                  >
                    {uploading ? "Uploading assets..." : busy ? "Submitting..." : "Generate video →"}
                  </button>
                </div>
              </form>

              <aside className="studio-card preview-panel">
                <div className="section-heading">
                  <div>
                    <span className="step">OUTPUT</span>
                    <h2>Preview & extend</h2>
                  </div>
                </div>

                {!job ? (
                  <div className="empty-preview">
                    <div className="preview-orb">▶</div>
                    <strong>Your persistent video output appears here</strong>
                    <span>Completed MP4 files are copied into private Supabase Storage.</span>
                  </div>
                ) : (
                  <div className="job-panel">
                    <div className="job-status">
                      <span className={"status-dot " + job.status} />
                      <div>
                        <strong>{statusLabel(job.status)}</strong>
                        <small>{job.message}</small>
                      </div>
                    </div>

                    {(job.status === "queued" || job.status === "processing") && (
                      <div className="render-stage">
                        <div className="render-glow" />
                        <span>Rendering and synchronizing...</span>
                        <div className="progress-track">
                          <div className="progress-indeterminate" />
                        </div>
                      </div>
                    )}

                    {job.videoUrl && (
                      <div className="video-wrap">
                        <video src={job.videoUrl} controls playsInline preload="metadata" />

                        <div className="video-actions">
                          <a className="download-button" href={job.videoUrl} download>
                            ↓ Download MP4
                          </a>
                        </div>

                        {modelMeta[modelTier === "lite" ? "fast" : modelTier].supportsExtend && (
                          <div className="extend-box">
                            <label>Extend this Veo video by 7 seconds</label>
                            <textarea
                              value={extendPrompt}
                              onChange={(e) => setExtendPrompt(e.target.value)}
                              placeholder="Describe what happens next..."
                            />
                            <button
                              type="button"
                              className="generate-button"
                              onClick={extendCurrentVideo}
                              disabled={busy || !extendPrompt.trim()}
                            >
                              Extend video
                            </button>
                            <small>
                              Extension uses 720p and requires the provider reference to still be valid.
                            </small>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </aside>
            </div>
          ) : (
            <div className="library-view">
              <div className="library-grid">
                {generations.map((item) => (
                  <article className="studio-card library-item" key={item.id}>
                    <div className="library-thumb">
                      {item.videoUrl ? (
                        <video src={item.videoUrl} muted preload="metadata" />
                      ) : (
                        <div className="library-placeholder">{item.mode.toUpperCase()}</div>
                      )}
                      <span className={"library-status " + item.status}>
                        {statusLabel(item.status)}
                      </span>
                    </div>

                    <div className="library-body">
                      <p>{item.prompt}</p>
                      <div className="library-meta">
                        <span>{modelMeta[item.model_tier].name.replace("Veo 3.1 ", "")}</span>
                        <span>{item.aspect_ratio}</span>
                        <span>{item.resolution}</span>
                        <span>{item.credits_reserved} cr</span>
                      </div>
                      <small>{new Date(item.created_at).toLocaleString("vi-VN")}</small>
                      <div className="library-actions">
                        <button
                          type="button"
                          className="open-button"
                          onClick={() => openGeneration(item)}
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {!generations.length && (
                <div className="studio-card library-empty">
                  <span>▦</span>
                  <h2>No generations yet</h2>
                  <p>Create your first persistent video project.</p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
