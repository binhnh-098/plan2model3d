"""Dung model 3D (khoi tuong) tu cac contour 2D da tach duoc."""
import numpy as np
import trimesh
from shapely.geometry import Polygon
from shapely.validation import make_valid


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
                poly = make_valid(poly)
            if poly.is_empty or poly.area <= 0:
                continue
        except Exception:
            continue

        geoms = poly.geoms if hasattr(poly, "geoms") else [poly]
        for g in geoms:
            if g.area <= 1e-6:
                continue
            try:
                mesh = trimesh.creation.extrude_polygon(g, height=wall_height_m)
                meshes.append(mesh)
            except Exception:
                continue

    if not meshes:
        raise ValueError("Khong tach duoc tuong nao tu anh - thu doi wall_thickness_px")

    combined = trimesh.util.concatenate(meshes)
    return combined


def export_glb(mesh: trimesh.Trimesh, out_path: str) -> None:
    mesh.apply_translation([0, 0, 0])
    mesh.export(out_path, file_type="glb")
