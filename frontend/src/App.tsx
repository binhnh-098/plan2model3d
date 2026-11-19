import { useState } from "react";
import ModelViewer from "./ModelViewer";

const API_BASE = "http://localhost:8000";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [wallHeight, setWallHeight] = useState(3.0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setModelUrl(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("wall_height_m", String(wallHeight));

    try {
      const res = await fetch(`${API_BASE}/api/floorplan/to-3d`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Co loi xay ra");
      }
      const data = await res.json();
      setModelUrl(`${API_BASE}${data.model_url}`);
      setInfo(`Phat hien ${data.wall_count} mang tuong. Ty le: 1px = ${data.scale_px_to_m.toFixed(4)}m`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Mat bang 2D &rarr; Model 3D</h1>

      <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 10 }}>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label>
            Chieu cao tuong (m):{" "}
            <input
              type="number"
              step="0.1"
              value={wallHeight}
              onChange={(e) => setWallHeight(Number(e.target.value))}
              style={{ width: 80 }}
            />
          </label>
        </div>
        <button type="submit" disabled={!file || loading}>
          {loading ? "Dang xu ly..." : "Dung model 3D"}
        </button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {info && <p style={{ color: "green" }}>{info}</p>}

      {modelUrl && (
        <div style={{ border: "1px solid #ccc" }}>
          <ModelViewer modelUrl={modelUrl} />
        </div>
      )}
    </div>
  );
}
