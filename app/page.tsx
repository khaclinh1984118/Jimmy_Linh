"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type VideoJob = {
  operation: string;
  status: "queued" | "processing" | "completed" | "failed";
  message: string;
  videoUrl?: string;
  error?: string;
};

export default function HomePage() {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration] = useState("8");
  const [resolution, setResolution] = useState("720p");
  const [job, setJob] = useState<VideoJob | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function refreshStatus(operation: string) {
    const response = await fetch(
      `/api/videos/status?operation=${encodeURIComponent(operation)}`,
      { cache: "no-store" },
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "Không thể kiểm tra trạng thái video.");
    }

    setJob(data);

    if (data.status === "completed" || data.status === "failed") {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(operation: string) {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(() => {
      refreshStatus(operation).catch((error) => {
        setJob((current) =>
          current
            ? { ...current, message: error instanceof Error ? error.message : "Lỗi kiểm tra trạng thái." }
            : current,
        );
      });
    }, 10000);
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
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Không thể tạo video.");

      setJob(data);
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

  return (
    <main>
      <div className="shell">
        <div className="hero">
          <div>
            <span className="badge">JIMMY AI VIDEO · VEO 3.1</span>
            <h1>Biến ý tưởng thành video thật.</h1>
            <p className="lead">
              Nhập mô tả cảnh quay, chọn định dạng, rồi hệ thống gửi job trực tiếp
              tới Google Veo 3.1 và tự cập nhật khi video render xong.
            </p>
          </div>
          <div className="hero-note">
            <strong>MVP thật</strong>
            <span>Text → Video</span>
            <span>Âm thanh sinh tự nhiên</span>
            <span>720p / 1080p</span>
          </div>
        </div>

        <form className="card" onSubmit={generateVideo}>
          <label htmlFor="prompt">Mô tả video</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={'Ví dụ: A cinematic sunrise over a Vietnamese school courtyard, slow drone push-in, students arriving, warm natural light, ambient morning sounds.'}
            required
          />

          <div className="tip">
            Mẹo: Veo hiểu tiếng Anh tốt nhất. Hãy mô tả chủ thể, hành động, góc máy,
            ánh sáng và âm thanh mong muốn.
          </div>

          <div className="grid three">
            <div>
              <label htmlFor="ratio">Tỉ lệ</label>
              <select id="ratio" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                <option value="16:9">16:9 · ngang</option>
                <option value="9:16">9:16 · dọc</option>
              </select>
            </div>

            <div>
              <label htmlFor="duration">Thời lượng</label>
              <select
                id="duration"
                value={duration}
                onChange={(e) => {
                  const value = e.target.value;
                  setDuration(value);
                  if (resolution === "1080p" && value !== "8") setResolution("720p");
                }}
              >
                <option value="4">4 giây</option>
                <option value="6">6 giây</option>
                <option value="8">8 giây</option>
              </select>
            </div>

            <div>
              <label htmlFor="resolution">Độ phân giải</label>
              <select
                id="resolution"
                value={resolution}
                onChange={(e) => {
                  const value = e.target.value;
                  setResolution(value);
                  if (value === "1080p") setDuration("8");
                }}
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p · 8 giây</option>
              </select>
            </div>
          </div>

          <button disabled={loading || !prompt.trim()}>
            {loading ? "Đang gửi tới Veo..." : "Tạo video bằng Veo"}
          </button>

          {job && (
            <section className="result">
              <div className="status-line">
                <strong>
                  {job.status === "queued" && "Đã xếp hàng"}
                  {job.status === "processing" && "Đang render"}
                  {job.status === "completed" && "Hoàn tất"}
                  {job.status === "failed" && "Không thành công"}
                </strong>
                {(job.status === "queued" || job.status === "processing") && (
                  <span className="pulse">Đang xử lý</span>
                )}
              </div>

              <p>{job.message}</p>

              {job.operation !== "error" && (
                <small>
                  Operation: <code>{job.operation}</code>
                </small>
              )}

              {job.videoUrl && (
                <div className="video-wrap">
                  <video src={job.videoUrl} controls playsInline preload="metadata" />
                  <a className="download" href={job.videoUrl} download="jimmy-ai-video.mp4">
                    Tải MP4
                  </a>
                </div>
              )}
            </section>
          )}
        </form>
      </div>
    </main>
  );
}
