"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Status = "queued" | "processing" | "completed" | "failed";

type VideoJob = {
  operation: string;
  status: Status;
  message: string;
  videoUrl?: string;
  error?: string;
  mode?: "text-to-video" | "image-to-video";
};

type LibraryItem = {
  id: string;
  operation: string;
  prompt: string;
  status: Status;
  createdAt: string;
  aspectRatio: string;
  duration: number;
  resolution: string;
  mode: "text-to-video" | "image-to-video";
  videoUrl?: string;
};

const LIBRARY_KEY = "jimmy-ai-video-library-v2";

const presets = [
  {
    label: "Cinematic",
    prompt:
      "Cinematic establishing shot, natural depth of field, slow controlled camera movement, realistic lighting, filmic contrast, detailed ambience and synchronized environmental sound.",
  },
  {
    label: "Drone",
    prompt:
      "Wide aerial drone shot, smooth forward flight, layered landscape depth, golden-hour light, realistic motion, natural wind and distant environmental audio.",
  },
  {
    label: "Product",
    prompt:
      "Premium commercial product shot, elegant studio lighting, slow orbit camera movement, crisp material details, clean background, subtle cinematic sound design.",
  },
  {
    label: "Social",
    prompt:
      "Energetic vertical social-video composition, fast but smooth camera movement, strong subject focus, modern lighting, visually clear action, punchy natural audio.",
  },
];

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Không thể đọc ảnh."));
    reader.readAsDataURL(file);
  });
}

function statusLabel(status: Status) {
  if (status === "queued") return "Đã xếp hàng";
  if (status === "processing") return "Đang render";
  if (status === "completed") return "Hoàn tất";
  return "Thất bại";
}

export default function HomePage() {
  const [view, setView] = useState<"create" | "library">("create");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration] = useState("8");
  const [resolution, setResolution] = useState("720p");
  const [job, setJob] = useState<VideoJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LIBRARY_KEY);
      if (saved) setLibrary(JSON.parse(saved));
    } catch {
      localStorage.removeItem(LIBRARY_KEY);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function persistLibrary(items: LibraryItem[]) {
    setLibrary(items);
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(items));
  }

  function patchLibrary(operation: string, patch: Partial<LibraryItem>) {
    setLibrary((current) => {
      const next = current.map((item) =>
        item.operation === operation ? { ...item, ...patch } : item,
      );
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
      return next;
    });
  }

  const estimatedCost = useMemo(() => {
    const seconds = Number(duration);
    if (resolution === "4k") return (seconds * 0.6).toFixed(2);
    return (seconds * 0.4).toFixed(2);
  }, [duration, resolution]);

  async function refreshStatus(operation: string, updateActive = true) {
    const response = await fetch(
      "/api/videos/status?operation=" + encodeURIComponent(operation),
      { cache: "no-store" },
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "Không thể kiểm tra trạng thái video.");
    }

    if (updateActive) setJob(data);
    patchLibrary(operation, {
      status: data.status,
      videoUrl: data.videoUrl,
    });

    if (data.status === "completed" || data.status === "failed") {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return data;
  }

  function startPolling(operation: string) {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(() => {
      refreshStatus(operation).catch((error) => {
        setJob((current) =>
          current
            ? {
                ...current,
                message:
                  error instanceof Error
                    ? error.message
                    : "Lỗi kiểm tra trạng thái.",
              }
            : current,
        );
      });
    }, 10000);
  }

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      alert("Chỉ hỗ trợ JPEG, PNG hoặc WebP.");
      event.target.value = "";
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      alert("Ảnh phải nhỏ hơn 4 MB.");
      event.target.value = "";
      return;
    }

    try {
      setImageDataUrl(await readFileAsDataUrl(file));
      setImageName(file.name);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Không thể đọc ảnh.");
    }
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
      if (!response.ok) throw new Error(data.error ?? "Không thể nâng cấp prompt.");
      setPrompt(data.prompt);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Không thể nâng cấp prompt.");
    } finally {
      setEnhancing(false);
    }
  }

  async function generateVideo(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setJob(null);

    try {
      const response = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          aspectRatio,
          duration: Number(duration),
          resolution,
          imageDataUrl,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Không thể tạo video.");

      setJob(data);

      const item: LibraryItem = {
        id: crypto.randomUUID(),
        operation: data.operation,
        prompt: prompt.trim(),
        status: data.status,
        createdAt: new Date().toISOString(),
        aspectRatio,
        duration: Number(duration),
        resolution,
        mode: imageDataUrl ? "image-to-video" : "text-to-video",
      };

      persistLibrary([item, ...library.filter((x) => x.operation !== data.operation)].slice(0, 30));
      startPolling(data.operation);
    } catch (error) {
      setJob({
        operation: "error",
        status: "failed",
        message: error instanceof Error ? error.message : "Đã xảy ra lỗi.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function openLibraryItem(item: LibraryItem) {
    setView("create");
    setPrompt(item.prompt);
    setAspectRatio(item.aspectRatio);
    setDuration(String(item.duration));
    setResolution(item.resolution);
    setJob({
      operation: item.operation,
      status: item.status,
      message:
        item.status === "completed"
          ? "Video đã tạo xong."
          : "Đang lấy trạng thái mới nhất...",
      videoUrl: item.videoUrl,
      mode: item.mode,
    });

    try {
      const data = await refreshStatus(item.operation);
      if (data.status === "queued" || data.status === "processing") {
        startPolling(item.operation);
      }
    } catch {
      // Keep the last saved snapshot visible.
    }
  }

  function removeLibraryItem(id: string) {
    persistLibrary(library.filter((item) => item.id !== id));
  }

  return (
    <main>
      <div className="studio-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">J</div>
            <div>
              <strong>Jimmy Studio</strong>
              <span>AI Video Generator</span>
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
              <em>{library.length}</em>
            </button>
          </nav>

          <div className="sidebar-info">
            <span className="online-dot" />
            <div>
              <strong>Veo 3.1</strong>
              <small>Real generation API</small>
            </div>
          </div>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <div>
              <span className="eyebrow">AI VIDEO STUDIO</span>
              <h1>{view === "create" ? "Create a new video" : "Your generations"}</h1>
            </div>
            <div className="model-pill">Veo 3.1 · Standard</div>
          </header>

          {view === "create" ? (
            <div className="create-grid">
              <form className="studio-card composer" onSubmit={generateVideo}>
                <div className="section-heading">
                  <div>
                    <span className="step">01</span>
                    <h2>Source</h2>
                  </div>
                  <span className="mode-chip">
                    {imageDataUrl ? "Image → Video" : "Text → Video"}
                  </span>
                </div>

                <div className="upload-zone">
                  {imageDataUrl ? (
                    <div className="image-preview">
                      <img src={imageDataUrl} alt="Ảnh đầu vào" />
                      <div className="image-meta">
                        <span>{imageName}</span>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => {
                            setImageDataUrl(null);
                            setImageName("");
                          }}
                        >
                          Xóa ảnh
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="upload-label">
                      <span className="upload-icon">＋</span>
                      <strong>Thêm ảnh khởi đầu</strong>
                      <small>Tùy chọn · JPEG, PNG, WebP · tối đa 4 MB</small>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleImage}
                      />
                    </label>
                  )}
                </div>

                <div className="section-heading prompt-heading">
                  <div>
                    <span className="step">02</span>
                    <h2>Prompt</h2>
                  </div>
                  <button
                    className="enhance-button"
                    type="button"
                    onClick={enhancePrompt}
                    disabled={!prompt.trim() || enhancing}
                  >
                    {enhancing ? "Đang tối ưu..." : "✦ Enhance"}
                  </button>
                </div>

                <textarea
                  className="prompt-box"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Mô tả chủ thể, hành động, bối cảnh, chuyển động camera, ánh sáng và âm thanh..."
                  required
                />

                <div className="preset-row">
                  {presets.map((preset) => (
                    <button
                      type="button"
                      className="preset"
                      key={preset.label}
                      onClick={() =>
                        setPrompt((current) =>
                          current.trim()
                            ? current.trim() + " " + preset.prompt
                            : preset.prompt,
                        )
                      }
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="section-heading settings-heading">
                  <div>
                    <span className="step">03</span>
                    <h2>Generation settings</h2>
                  </div>
                </div>

                <div className="settings-grid">
                  <div>
                    <label htmlFor="ratio">Frame</label>
                    <select
                      id="ratio"
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value)}
                    >
                      <option value="16:9">16:9 · Landscape</option>
                      <option value="9:16">9:16 · Portrait</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="duration">Duration</label>
                    <select
                      id="duration"
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
                    >
                      <option value="4">4 seconds</option>
                      <option value="6">6 seconds</option>
                      <option value="8">8 seconds</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="resolution">Resolution</label>
                    <select
                      id="resolution"
                      value={resolution}
                      onChange={(e) => {
                        const value = e.target.value;
                        setResolution(value);
                        if (value === "1080p" || value === "4k") setDuration("8");
                      }}
                    >
                      <option value="720p">720p</option>
                      <option value="1080p">1080p · 8 sec</option>
                      <option value="4k">4K · 8 sec</option>
                    </select>
                  </div>
                </div>

                <div className="generate-bar">
                  <div>
                    <small>Ước tính Veo Standard</small>
                    <strong>~${estimatedCost} / generation</strong>
                  </div>
                  <button
                    className="generate-button"
                    disabled={loading || !prompt.trim()}
                  >
                    {loading ? "Đang gửi..." : "Generate video →"}
                  </button>
                </div>
              </form>

              <aside className="studio-card preview-panel">
                <div className="section-heading">
                  <div>
                    <span className="step">PREVIEW</span>
                    <h2>Output</h2>
                  </div>
                </div>

                {!job ? (
                  <div className="empty-preview">
                    <div className="preview-orb">▶</div>
                    <strong>Your video will appear here</strong>
                    <span>Configure your scene and start generation.</span>
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
                        <span>Veo is rendering your scene</span>
                        <div className="progress-track">
                          <div className="progress-indeterminate" />
                        </div>
                      </div>
                    )}

                    {job.videoUrl && (
                      <div className="video-wrap">
                        <video
                          src={job.videoUrl}
                          controls
                          playsInline
                          preload="metadata"
                        />
                        <div className="video-actions">
                          <a
                            className="download-button"
                            href={job.videoUrl}
                            download="jimmy-ai-video.mp4"
                          >
                            ↓ Download MP4
                          </a>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => navigator.clipboard.writeText(prompt)}
                          >
                            Copy prompt
                          </button>
                        </div>
                      </div>
                    )}

                    {job.status === "failed" && (
                      <div className="error-box">{job.error || job.message}</div>
                    )}

                    {job.operation !== "error" && (
                      <code className="operation-code">{job.operation}</code>
                    )}
                  </div>
                )}
              </aside>
            </div>
          ) : (
            <div className="library-view">
              {library.length === 0 ? (
                <div className="studio-card library-empty">
                  <span>▦</span>
                  <h2>Chưa có video nào</h2>
                  <p>Các generation mới sẽ xuất hiện tại đây.</p>
                  <button className="generate-button" onClick={() => setView("create")}>
                    Create first video
                  </button>
                </div>
              ) : (
                <div className="library-grid">
                  {library.map((item) => (
                    <article className="studio-card library-item" key={item.id}>
                      <div className="library-thumb">
                        {item.videoUrl && item.status === "completed" ? (
                          <video src={item.videoUrl} muted preload="metadata" />
                        ) : (
                          <div className="library-placeholder">
                            {item.mode === "image-to-video" ? "IMG → VIDEO" : "TEXT → VIDEO"}
                          </div>
                        )}
                        <span className={"library-status " + item.status}>
                          {statusLabel(item.status)}
                        </span>
                      </div>
                      <div className="library-body">
                        <p>{item.prompt}</p>
                        <div className="library-meta">
                          <span>{item.aspectRatio}</span>
                          <span>{item.duration}s</span>
                          <span>{item.resolution}</span>
                        </div>
                        <small>
                          {new Date(item.createdAt).toLocaleString("vi-VN")}
                        </small>
                        <div className="library-actions">
                          <button
                            type="button"
                            className="open-button"
                            onClick={() => openLibraryItem(item)}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            className="delete-button"
                            onClick={() => removeLibraryItem(item.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
