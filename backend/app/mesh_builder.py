"""Dung model 3D (khoi tuong) tu cac contour 2D da tach duoc."""
import numpy as np
import trimesh
from shapely.geometry import Polygon


def build_walls_mesh(
    contours_with_hierarchy,
    px_to_m: float,
    wall_height_m: float = 3.0,
) -> trimesh.Trimesh:
    """contours_with_hierarchy: list[(points_Nx2_px, hierarchy_row)]
    hierarchy_row[3] >= 0  => contour nay la lo (hole) cua 1 contour cha.

    Gop cac contour theo cap cha/con (outer wall ring + hole o giua) thanh
    polygon shapely, roi extrude len thanh khoi 3D.
    """
    # Gom theo chi so cha: cha -> list cac lo con cua no
    outer_indices = [i for i, (_, h) in enumerate(contours_with_hierarchy) if h[3] == -1]
    holes_by_parent = {}
    for i, (_, h) in enumerate(contours_with_hierarchy):
        parent = h[3]
        if parent != -1:
            holes_by_parent.setdefault(parent, []).append(i)

    meshes = []
    for idx in outer_indices:
        pts_px, _ = contours_with_hierarchy[idx]
        if len(pts_px) < 3:
            continue
        exterior_m = (pts_px * px_to_m).tolist()

        interiors_m = []
        for hole_idx in holes_by_parent.get(idx, []):
            hole_pts_px, _ = contours_with_hierarchy[hole_idx]
            if len(hole_pts_px) >= 3:
                interiors_m.append((hole_pts_px * px_to_m).tolist())

        try:
            poly = Polygon(exterior_m, interiors_m)
            if not poly.is_valid:
                # buffer(0) la cach chuan de sua polygon tu cat chinh no (vd
                # tuong qua mong khien bien ngoai va bien lo cham nhau) - cho
                # ra Polygon/MultiPolygon sach, khac voi make_valid co the
                # tra ve GeometryCollection lon xon lan ca Point/LineString.
                poly = poly.buffer(0)
            if poly.is_empty or poly.area <= 0:
                continue
        except Exception:
            continue

        geoms = poly.geoms if hasattr(poly, "geoms") else [poly]
        for g in geoms:
            if g.geom_type != "Polygon" or g.area <= 1e-6:
                continue
            try:
                mesh = trimesh.creation.extrude_polygon(g, height=wall_height_m)
                meshes.append(mesh)
            except Exception:
                continue

    if not meshes:
        raise ValueError("Khong tach duoc tuong nao tu anh - thu doi dark_threshold")

    combined = trimesh.util.concatenate(meshes)
    combined.visual.face_colors = [210, 210, 215, 255]
    return combined


def build_floors_mesh(
    room_polygons_px,
    px_to_m: float,
    floor_thickness_m: float = 0.08,
) -> trimesh.Trimesh | None:
    """Dung san MONG cho tung phong (khong co tran/mai) de co mat phang
    dat noi that len tren, khong lam kin khong gian ben tren."""
    meshes = []
    for pts_px in room_polygons_px:
        if len(pts_px) < 3:
            continue
        pts_m = (pts_px * px_to_m).tolist()
        try:
            poly = Polygon(pts_m)
            if not poly.is_valid:
                poly = poly.buffer(0)
            if poly.is_empty or poly.area <= 0:
                continue
        except Exception:
            continue

        geoms = poly.geoms if hasattr(poly, "geoms") else [poly]
        for g in geoms:
            if g.geom_type != "Polygon" or g.area <= 1e-6:
                continue
            try:
                floor = trimesh.creation.extrude_polygon(g, height=floor_thickness_m)
                floor.apply_translation([0, 0, -floor_thickness_m])
                meshes.append(floor)
            except Exception:
                continue

    if not meshes:
        return None
    combined = trimesh.util.concatenate(meshes)
    combined.visual.face_colors = [120, 150, 190, 255]
    return combined


def export_glb(mesh: trimesh.Trimesh, out_path: str) -> None:
    """Xuat GLB.

    extrude_polygon dung chieu cao theo truc Z (quy uoc CAD/trimesh), nhung
    chuan glTF/three.js coi truc Y la chieu cao. Neu khong xoay truoc khi
    xuat, moi app doc file GLB dung chuan se hien thi model SAI HUONG (nam
    ngang thay vi dung len). Xoay -90 do quanh truc X de doi Z(cao)->Y(cao),
    giu nguyen hinh dang mat bang X/Y nhu anh goc (chi doi huong truc).
    """
    rotation = trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0])
    mesh.apply_transform(rotation)
    mesh.export(out_path, file_type="glb")
