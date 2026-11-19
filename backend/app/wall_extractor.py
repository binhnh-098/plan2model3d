"""Tach tuong (duong net day) ra khoi anh mat bang kien truc."""
import cv2
import numpy as np


def extract_wall_mask(image_bgr: np.ndarray, wall_thickness_px: int = 6) -> np.ndarray:
    """Tra ve anh nhi phan (0/255): pixel 255 = thuoc tuong.

    Y tuong: tuong trong ban ve CAD thuong la net DAY nhat va lien tuc.
    Dung morphological opening voi kernel lon de giu lai chi nhung vung
    du day (tuong), loai bo net mong (noi that, chu, kich thuoc).
    """
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

    # Nhi phan hoa: net ve (den) -> trang, nen -> den
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Loai nhieu nho
    denoised = cv2.medianBlur(binary, 3)

    # Opening voi kernel ~ do day tuong -> chi giu lai net day (tuong)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (wall_thickness_px, wall_thickness_px))
    wall_mask = cv2.morphologyEx(denoised, cv2.MORPH_OPEN, kernel, iterations=1)

    # Dong cac ke ho nho de tuong lien mach
    close_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    wall_mask = cv2.morphologyEx(wall_mask, cv2.MORPH_CLOSE, close_kernel, iterations=2)

    return wall_mask


def find_wall_contours(wall_mask: np.ndarray, min_area: int = 40):
    """Tra ve list contour (toa do pixel) cua tung mang tuong, kem hierarchy
    de phan biet contour ngoai / lo (hole) ben trong."""
    contours, hierarchy = cv2.findContours(
        wall_mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE
    )
    filtered = []
    for i, c in enumerate(contours):
        if cv2.contourArea(c) >= min_area:
            eps = 1.5
            approx = cv2.approxPolyDP(c, eps, True)
            filtered.append((approx.reshape(-1, 2), hierarchy[0][i]))
    return filtered
