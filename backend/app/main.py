import io
import os
import uuid

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import trimesh

from app.mesh_builder import build_floors_mesh, build_manual_room, build_walls_mesh, export_glb
from app.wall_extractor import extract_wall_mask, find_room_polygons, find_wall_contours

app = FastAPI(title="HouseIn - Floor Plan to 3D")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "generated")
os.makedirs(OUTPUT_DIR, exist_ok=True)
app.mount("/debug", StaticFiles(directory=OUTPUT_DIR), name="debug")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/floorplan/to-3d")
async def floorplan_to_3d(
    file: UploadFile = File(...),
    dark_threshold: int = Form(80),
    gap_close_px: int = Form(40),
    wall_height_m: float = Form(3.0),
    known_length_px: float = Form(None),
    known_length_m: float = Form(None),
):
    content = await file.read()
    np_arr = np.frombuffer(content, np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Không đọc được file ảnh")

    if known_length_px and known_length_m and known_length_px > 0:
        px_to_m = known_length_m / known_length_px
    else:
        # Mặc định giả định ~100 px = 1m nếu không có thông tin tỷ lệ
        px_to_m = 1.0 / 100.0

    wall_mask = extract_wall_mask(image, dark_threshold=dark_threshold, gap_close_px=gap_close_px)
    contours = find_wall_contours(wall_mask)
    if not contours:
        raise HTTPException(
            status_code=422,
            detail="Không phát hiện được tường nào trong ảnh. Thử ảnh rõ nét hơn hoặc chỉnh dark_threshold.",
        )

    try:
        walls_mesh = build_walls_mesh(contours, px_to_m=px_to_m, wall_height_m=wall_height_m)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    room_polygons = find_room_polygons(wall_mask)
    floors_mesh = build_floors_mesh(room_polygons, px_to_m=px_to_m)

    final_mesh = (
        trimesh.util.concatenate([walls_mesh, floors_mesh])
        if floors_mesh is not None
        else walls_mesh
    )

    job_id = str(uuid.uuid4())
    out_path = os.path.join(OUTPUT_DIR, f"{job_id}.glb")
    export_glb(final_mesh, out_path)

    return {
        "job_id": job_id,
        "model_url": f"/api/floorplan/model/{job_id}",
        "wall_count": len(contours),
        "room_count": len(room_polygons),
        "scale_px_to_m": px_to_m,
    }


@app.post("/api/room/manual")
async def create_manual_room(
    length_m: float = Form(...),
    width_m: float = Form(...),
    wall_height_m: float = Form(2.8),
    wall_thickness_m: float = Form(0.1),
):
    if length_m <= 0 or width_m <= 0:
        raise HTTPException(status_code=422, detail="Chiều dài/rộng phải lớn hơn 0")
    if wall_thickness_m * 2 >= min(length_m, width_m):
        raise HTTPException(status_code=422, detail="Độ dày tường quá lớn so với kích thước phòng")

    mesh = build_manual_room(
        length_m=length_m,
        width_m=width_m,
        wall_height_m=wall_height_m,
        wall_thickness_m=wall_thickness_m,
    )

    job_id = str(uuid.uuid4())
    out_path = os.path.join(OUTPUT_DIR, f"{job_id}.glb")
    export_glb(mesh, out_path)

    return {
        "job_id": job_id,
        "model_url": f"/api/floorplan/model/{job_id}",
    }


@app.get("/api/floorplan/model/{job_id}")
def get_model(job_id: str):
    path = os.path.join(OUTPUT_DIR, f"{job_id}.glb")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Không tìm thấy model")
    return FileResponse(path, media_type="model/gltf-binary", filename=f"{job_id}.glb")
