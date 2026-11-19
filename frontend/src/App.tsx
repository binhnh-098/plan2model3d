import { useRef, useState } from "react";
import ModelViewer from "./ModelViewer";
import "./App.css";

const API_BASE = "http://localhost:8000";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [wallHeight, setWallHeight] = useState(3.0);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyFile = (f: File | null) => {
    setFile(f);
    setModelUrl(null);
    setError(null);
    setInfo(null);
    if (f) {
      setPreviewUrl(URL.createObjectURL(f));
    } else {
      setPreviewUrl(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) applyFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setModelUrl(null);
    setInfo(null);

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
      setInfo(`Phat hien ${data.wall_count} mang tuong · Ty le 1px = ${data.scale_px_to_m.toFixed(4)}m`);
    } catch (err: any) {
      setError(err.message || "Co loi xay ra, thu lai sau.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="eyebrow">HouseIn · Beta</span>
        <h1>Mat bang 2D &rarr; Model 3D</h1>
        <p>
          Tai len anh mat bang kien truc (co ghi kich thuoc), he thong se tu dong
          nhan dien tuong va dung thanh khoi 3D de ban xem truoc khong gian.
        </p>
      </header>

      <div className="layout">
        <section className="panel">
          <h2>1. Tai anh len</h2>
          <form onSubmit={handleSubmit}>
            <label
              className={`dropzone ${dragging ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => applyFile(e.target.files?.[0] ?? null)}
              />
              <div className="dropzone-icon">📐</div>
              <div className="dropzone-text">
                {file ? (
                  <strong>{file.name}</strong>
                ) : (
                  <>
                    <strong>Keo tha anh</strong> hoac bam de chon file
                  </>
                )}
              </div>
            </label>

            {previewUrl && (
              <img src={previewUrl} alt="preview" className="preview-thumb" />
            )}

            <div className="field">
              <label htmlFor="wallHeight">Chieu cao tuong (met)</label>
              <input
                id="wallHeight"
                type="number"
                step="0.1"
                min="1"
                value={wallHeight}
                onChange={(e) => setWallHeight(Number(e.target.value))}
              />
            </div>

            <button type="submit" className="submit-btn" disabled={!file || loading}>
              {loading && <span className="spinner" />}
              {loading ? "Dang xu ly..." : "Dung model 3D"}
            </button>

            {error && <div className="status-banner error">{error}</div>}
            {info && !error && <div className="status-banner success">{info}</div>}
          </form>
        </section>

        <section className="panel viewer-panel">
          <h2>2. Xem truoc 3D</h2>
          {modelUrl ? (
            <>
              <div className="viewer-wrapper">
                <ModelViewer modelUrl={modelUrl} />
              </div>
              <div className="viewer-hint">Keo chuot de xoay · Cuon de zoom</div>
            </>
          ) : (
            <div className="viewer-empty">
              <div className="big-icon">🏠</div>
              <div>
                {loading ? "Dang dung model, vui long cho..." : "Model 3D se hien o day sau khi xu ly xong"}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
