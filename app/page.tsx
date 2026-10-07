"use client";

import { FormEvent, useState } from "react";

type VideoJob = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  prompt: string;
  aspectRatio: string;
  duration: number;
  message: string;
};

export default function HomePage() {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration] = useState("8");
  const [job, setJob] = useState<VideoJob | null>(null);
  const [loading, setLoading] = useState(false);

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
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Không thể tạo video.");
      setJob(data);
    } catch (error) {
      setJob({
        id: "error",
        status: "failed",
        prompt,
        aspectRatio,
        duration: Number(duration),
        message: error instanceof Error ? error.message : "Đã xảy ra lỗi.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <div className="shell">
        <span className="badge">AI VIDEO LAB · STARTER</span>
        <h1>Biến ý tưởng thành video.</h1>
        <p className="lead">
          Nhập mô tả cảnh quay, chọn tỉ lệ và thời lượng. Bộ khung hiện dùng
          mock provider, sẵn sàng thay bằng API tạo video thật.
        </p>

        <form className="card" onSubmit={generateVideo}>
          <label htmlFor="prompt">Mô tả video</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ví dụ: Một ngôi trường Việt Nam lúc bình minh, camera bay chậm qua sân trường..."
            required
          />

          <div className="grid">
            <div>
              <label htmlFor="ratio">Tỉ lệ khung hình</label>
              <select id="ratio" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                <option>16:9</option>
                <option>9:16</option>
                <option>1:1</option>
              </select>
            </div>

            <div>
              <label htmlFor="duration">Thời lượng</label>
              <select id="duration" value={duration} onChange={(e) => setDuration(e.target.value)}>
                <option value="5">5 giây</option>
                <option value="8">8 giây</option>
                <option value="10">10 giây</option>
              </select>
            </div>
          </div>

          <button disabled={loading || !prompt.trim()}>
            {loading ? "Đang tạo job..." : "Tạo video"}
          </button>

          {job && (
            <div className="result">
              <strong>Trạng thái: {job.status}</strong>
              <p>{job.message}</p>
              <small>Job ID: <code>{job.id}</code></small>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
