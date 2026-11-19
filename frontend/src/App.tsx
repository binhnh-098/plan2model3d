import { useRef, useState } from "react";
import ModelViewer from "./ModelViewer";
import "./App.css";

const API_BASE = "http://localhost:8000";

type Mode = "upload" | "manual";

export default function App() {
  const [mode, setMode] = useState<Mode>("upload");

  // --- Upload anh ---
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [wallHeight, setWallHeight] = useState(3.0);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Nhap kich thuoc ---
  const [length, setLength] = useState(4.0);
  const [width, setWidth] = useState(3.0);
  const [manualWallHeight, setManualWallHeight] = useState(2.8);

  // --- Dung chung ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const resetResult = () => {
    setModelUrl(null);
    setError(null);
    setInfo(null);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    resetResult();
  };

  const applyFile = (f: File | null) => {
    setFile(f);
    resetResult();
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) applyFile(f);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    resetResult();

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
      setInfo(
        `Phat hien ${data.wall_count} mang tuong, ${data.room_count} phong · Ty le 1px = ${data.scale_px_to_m.toFixed(4)}m`
      );
    } catch (err: any) {
      setError(err.message || "Co loi xay ra, thu lai sau.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (length <= 0 || width <= 0) return;
    setLoading(true);
    resetResult();

    const formData = new FormData();
    formData.append("length_m", String(length));
    formData.append("width_m", String(width));
    formData.append("wall_height_m", String(manualWallHeight));

    try {
      const res = await fetch(`${API_BASE}/api/room/manual`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Co loi xay ra");
      }
      const data = await res.json();
      setModelUrl(`${API_BASE}${data.model_url}`);
      setInfo(`Da dung phong ${length}m × ${width}m, cao ${manualWallHeight}m`);
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
          Tai len anh mat bang kien truc hoac tu nhap kich thuoc phong, he thong
          se dung model 3D mo nap de ban thiet ke noi that.
        </p>
      </header>

      <div className="layout">
        <section className="panel">
          <div className="mode-tabs">
            <button
              type="button"
              className={`mode-tab ${mode === "upload" ? "active" : ""}`}
              onClick={() => switchMode("upload")}
            >
              Tai anh len
            </button>
            <button
              type="button"
              className={`mode-tab ${mode === "manual" ? "active" : ""}`}
              onClick={() => switchMode("manual")}
            >
              Nhap kich thuoc
            </button>
          </div>

          {mode === "upload" ? (
            <form onSubmit={handleUploadSubmit}>
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
            </form>
          ) : (
            <form onSubmit={handleManualSubmit}>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="length">Chieu dai (met)</label>
                  <input
                    id="length"
                    type="number"
                    step="0.1"
                    min="0.5"
                    value={length}
                    onChange={(e) => setLength(Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="width">Chieu rong (met)</label>
                  <input
                    id="width"
                    type="number"
                    step="0.1"
                    min="0.5"
                    value={width}
                    onChange={(e) => setWidth(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="manualWallHeight">Chieu cao tuong (met)</label>
                <input
                  id="manualWallHeight"
                  type="number"
                  step="0.1"
                  min="1"
                  value={manualWallHeight}
                  onChange={(e) => setManualWallHeight(Number(e.target.value))}
                />
              </div>

              <div className="room-preview-box">
                <div
                  className="room-preview-rect"
                  style={{
                    aspectRatio: `${length} / ${width}`,
                  }}
                >
                  {length}m × {width}m
                </div>
              </div>

              <button
                type="submit"
                className="submit-btn"
                disabled={length <= 0 || width <= 0 || loading}
              >
                {loading && <span className="spinner" />}
                {loading ? "Dang xu ly..." : "Dung phong 3D"}
              </button>
            </form>
          )}

          {error && <div className="status-banner error">{error}</div>}
          {info && !error && <div className="status-banner success">{info}</div>}
        </section>

        <section className="panel viewer-panel">
          <h2>Xem truoc 3D</h2>
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
