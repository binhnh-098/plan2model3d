"""Tach tuong (net DEN DAM) ra khoi anh mat bang kien truc.

Quan sat quan trong tu du lieu thuc te:
- Tuong duoc ve bang net DEN THAT (gan RGB 0), con noi that/hatching/dim-line
  la net XAM NHAT HON (RGB ~150-220) -> threshold CO DINH theo do sang tach
  tot hon Otsu (vi Otsu gop ca xam lan den vao foreground).
- Net ve trong ban CAD xuat anh nay RAT MONG (~1-2px, co anti-alias) nen
  KHONG THE dung morphological OPENING de loc nhieu - opening du nho (2x2)
  cung xoa mat phan lon net tuong. Phai loc nhieu bang connected-component
  (xoa cum pixel qua nho theo dien tich), khong dung opening.
"""
import cv2
import numpy as np


def extract_wall_mask(
    image_bgr: np.ndarray,
    dark_threshold: int = 80,
    min_component_area: int = 15,
    gap_close_px: int = 25,
) -> np.ndarray:
    """Tra ve anh nhi phan (0/255): pixel 255 = thuoc tuong.

    Cac buoc:
    1) Threshold CO DINH theo do sang -> chi giu net DEN THAT (tuong),
       loai net xam (noi that/hatching).
    2) Loc nhieu bang connected-component: xoa cac cum pixel qua nho (text,
       ky hieu, cham) MA KHONG lam mong di net tuong that (khac voi opening).
    3) Directional closing: noi lai cac doan tuong thang hang bi dut quang
       (do cua, do giao voi net khac) bang kernel dai theo truc ngang va
       truc doc rieng biet, roi gop lai (OR).
    4) Dong nhe lan cuoi de lam day/lien mach tuong, khep goc.
    """
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

    # Buoc 1: chi giu net DEN THAT (tuong) - loai net xam (noi that)
    _, binary = cv2.threshold(gray, dark_threshold, 255, cv2.THRESH_BINARY_INV)

    # Buoc 2: loc nhieu theo dien tich cum pixel (khong lam mong net)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    wall_only = np.zeros_like(binary)
    for label_id in range(1, num_labels):
        if stats[label_id, cv2.CC_STAT_AREA] >= min_component_area:
            wall_only[labels == label_id] = 255

    # Buoc 3: noi cac doan tuong cung huong bi dut quang (cua, giao cat)
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (gap_close_px, 1))
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, gap_close_px))
    closed_h = cv2.morphologyEx(wall_only, cv2.MORPH_CLOSE, h_kernel, iterations=1)
    closed_v = cv2.morphologyEx(wall_only, cv2.MORPH_CLOSE, v_kernel, iterations=1)
    merged = cv2.bitwise_or(closed_h, closed_v)

    # Buoc 4: dong nhe lan cuoi de lam day tuong lien mach, khep kin goc
    smooth_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    wall_mask = cv2.morphologyEx(merged, cv2.MORPH_CLOSE, smooth_kernel, iterations=2)

    return wall_mask


def find_room_polygons(wall_mask: np.ndarray, min_area: int = 2000):
    """Tim cac vung PHONG (khong gian rong duoc bao boc kin boi tuong).

    Cach lam: dao nguoc mask (tuong=0, con lai=255), flood-fill tu goc anh
    de danh dau vung NEN BEN NGOAI nha (khong phai phong), phan con lai la
    cac phong duoc tuong bao kin - dung lam san (floor) cho tung phong.
    """
    inverted = cv2.bitwise_not(wall_mask)

    flood = inverted.copy()
    h, w = flood.shape
    fill_mask = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(flood, fill_mask, (0, 0), 0)  # loai vung nen ngoai nha

    contours, hierarchy = cv2.findContours(flood, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    rooms = []
    for i, c in enumerate(contours):
        if hierarchy[0][i][3] != -1:
            continue  # bo qua lo nho ben trong 1 phong (vd tru cot)
        if cv2.contourArea(c) >= min_area:
            eps = 1.5
            approx = cv2.approxPolyDP(c, eps, True)
            rooms.append(approx.reshape(-1, 2))
    return rooms


def find_wall_contours(wall_mask: np.ndarray, min_area: int = 60):
    """Tra ve list contour (toa do pixel) cua tung mang tuong, kem hierarchy
    da REMAP de phan biet contour ngoai / lo (hole) ben trong.

    QUAN TRONG: cv2.findContours tra ve hierarchy voi chi so CHA/CON la chi
    so trong mang contours GOC (truoc khi loc theo min_area). Neu chi loc
    roi giu nguyen gia tri parent goc, no se tro sai sang vi tri khac trong
    danh sach da loc (hoac tro toi 1 contour da bi loai) -> mat lien ket
    hole, khien tuong ngoai bi extrude thanh khoi DAC thay vi khung RONG.
    Phai remap lai chi so sau khi loc.
    """
    contours, hierarchy = cv2.findContours(
        wall_mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE
    )
    if hierarchy is None:
        return []

    kept_original_indices = [
        i for i, c in enumerate(contours) if cv2.contourArea(c) >= min_area
    ]
    old_to_new = {orig: new for new, orig in enumerate(kept_original_indices)}

    filtered = []
    for orig_idx in kept_original_indices:
        c = contours[orig_idx]
        eps = 1.5
        approx = cv2.approxPolyDP(c, eps, True)

        old_parent = hierarchy[0][orig_idx][3]
        new_parent = old_to_new.get(old_parent, -1)

        new_hierarchy_row = np.array([-1, -1, -1, new_parent])
        filtered.append((approx.reshape(-1, 2), new_hierarchy_row))
    return filtered
