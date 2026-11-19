import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  createDoorMarker,
  createFurniture,
  createWallSegment,
  FURNITURE_LABELS,
} from "./furniture";
import type { FurnitureType } from "./furniture";

type Props = { modelUrl: string };

type PendingWall = { start: THREE.Vector3 } | null;

type MenuState = {
  x: number;
  y: number;
  point: THREE.Vector3;
  surface: "floor" | "wall" | "object";
  normal?: THREE.Vector3;
  targetObject?: THREE.Object3D;
} | null;

export default function ModelViewer({ modelUrl }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [furnitureSubmenu, setFurnitureSubmenu] = useState(false);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const loadedModelRef = useRef<THREE.Object3D | null>(null);
  const userGroupRef = useRef<THREE.Group>(new THREE.Group());
  const wallHeightRef = useRef<number>(2.6);
  const pendingWallRef = useRef<PendingWall>(null);
  const previewLineRef = useRef<THREE.Line | null>(null);
  const dragStateRef = useRef<{
    object: THREE.Object3D;
    plane: THREE.Plane;
    offset: THREE.Vector3;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x121826);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(8, 8, 8);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 0.8;
    controls.panSpeed = 0.8;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.5;
    controls.maxDistance = 200;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    const grid = new THREE.GridHelper(40, 40, 0x2a3650, 0x1c2438);
    scene.add(grid);

    const userGroup = new THREE.Group();
    userGroupRef.current = userGroup;
    scene.add(userGroup);

    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        scene.add(gltf.scene);
        loadedModelRef.current = gltf.scene;

        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        wallHeightRef.current = size.y > 0.3 ? size.y : 2.6;

        controls.target.copy(center);
        camera.position.set(
          center.x + maxDim * 0.9,
          center.y + maxDim * 0.8,
          center.z + maxDim * 0.9
        );
        camera.near = maxDim / 100;
        camera.far = maxDim * 50;
        camera.updateProjectionMatrix();
        controls.minDistance = maxDim * 0.05;
        controls.maxDistance = maxDim * 10;
        controls.update();
      },
      undefined,
      (err) => console.error("Loi load model:", err)
    );

    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // --- Raycast helpers ---
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const setNdcFromEvent = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const pickRaycastTargets = (): THREE.Object3D[] => {
      const targets: THREE.Object3D[] = [];
      if (loadedModelRef.current) targets.push(loadedModelRef.current);
      targets.push(userGroupRef.current);
      return targets;
    };

    const clearPreviewLine = () => {
      if (previewLineRef.current) {
        scene.remove(previewLineRef.current);
        previewLineRef.current.geometry.dispose();
        (previewLineRef.current.material as THREE.Material).dispose();
        previewLineRef.current = null;
      }
    };

    const cancelPlacingWall = () => {
      pendingWallRef.current = null;
      clearPreviewLine();
      setHint(null);
    };

    const findUserAddedRoot = (obj: THREE.Object3D): THREE.Object3D | null => {
      let cur: THREE.Object3D | null = obj;
      while (cur) {
        if (cur.userData?.userAdded && cur.parent === userGroupRef.current) return cur;
        cur = cur.parent;
      }
      return null;
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();

      if (pendingWallRef.current) {
        cancelPlacingWall();
        return;
      }

      setNdcFromEvent(e);
      raycaster.setFromCamera(ndc, camera);
      const intersects = raycaster.intersectObjects(pickRaycastTargets(), true);
      if (intersects.length === 0) {
        setMenu(null);
        return;
      }

      const hit = intersects[0];
      const containerRect = container.getBoundingClientRect();
      const menuX = e.clientX - containerRect.left;
      const menuY = e.clientY - containerRect.top;

      const userRoot = findUserAddedRoot(hit.object);
      if (userRoot) {
        setMenu({ x: menuX, y: menuY, point: hit.point.clone(), surface: "object", targetObject: userRoot });
        return;
      }

      let worldNormal = new THREE.Vector3(0, 1, 0);
      if (hit.face) {
        worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      }
      const isWall = Math.abs(worldNormal.y) < 0.5;

      // Neu diem bam la mat tren (floor-like) nhung nam cao hon san that
      // (vd dinh camera chua du thang dung, tia trung mat TREN cua tuong
      // thay vi san ben trong) - ban mot tia thang dung xuong tu diem do de
      // tim lai dung mat san (y~0), tranh dat do vat sai vi tri ngoai phong.
      let finalPoint = hit.point.clone();
      if (!isWall && finalPoint.y > 0.15) {
        const downRay = new THREE.Raycaster(
          new THREE.Vector3(finalPoint.x, finalPoint.y + 1000, finalPoint.z),
          new THREE.Vector3(0, -1, 0)
        );
        const downHits = downRay
          .intersectObjects(pickRaycastTargets(), true)
          .filter((h) => h.point.y <= 0.15);
        if (downHits.length > 0) {
          finalPoint = downHits[0].point.clone();
        }
      }

      setMenu({
        x: menuX,
        y: menuY,
        point: finalPoint,
        surface: isWall ? "wall" : "floor",
        normal: worldNormal,
      });
    };

    const handleClick = (e: MouseEvent) => {
      if (menuOpenRef.current) return; // menu DOM has its own stopPropagation
      if (!pendingWallRef.current) return;

      setNdcFromEvent(e);
      raycaster.setFromCamera(ndc, camera);
      const intersects = raycaster.intersectObjects(pickRaycastTargets(), true);
      if (intersects.length === 0) return;

      const endPoint = intersects[0].point.clone();
      endPoint.y = 0;
      const startPoint = pendingWallRef.current.start;

      if (startPoint.distanceTo(endPoint) > 0.15) {
        const wall = createWallSegment(startPoint, endPoint, wallHeightRef.current);
        userGroupRef.current.add(wall);
      }
      cancelPlacingWall();
    };

    const handlePointerMove = (e: MouseEvent) => {
      if (dragStateRef.current) {
        setNdcFromEvent(e);
        raycaster.setFromCamera(ndc, camera);
        const pt = new THREE.Vector3();
        const hitPlane = raycaster.ray.intersectPlane(dragStateRef.current.plane, pt);
        if (hitPlane) {
          const obj = dragStateRef.current.object;
          obj.position.x = pt.x + dragStateRef.current.offset.x;
          obj.position.z = pt.z + dragStateRef.current.offset.z;
        }
        return;
      }

      if (!pendingWallRef.current) return;
      setNdcFromEvent(e);
      raycaster.setFromCamera(ndc, camera);
      const intersects = raycaster.intersectObjects(pickRaycastTargets(), true);
      if (intersects.length === 0) return;

      const current = intersects[0].point.clone();
      current.y = 0.02;
      const start = pendingWallRef.current.start.clone();
      start.y = 0.02;

      clearPreviewLine();
      const geom = new THREE.BufferGeometry().setFromPoints([start, current]);
      const mat = new THREE.LineDashedMaterial({ color: 0x5b8cff, dashSize: 0.15, gapSize: 0.1 });
      const line = new THREE.Line(geom, mat);
      line.computeLineDistances();
      scene.add(line);
      previewLineRef.current = line;
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // chi chuot trai
      if (menuOpenRef.current || pendingWallRef.current) return;

      setNdcFromEvent(e);
      raycaster.setFromCamera(ndc, camera);
      const intersects = raycaster.intersectObject(userGroupRef.current, true);
      if (intersects.length === 0) return;

      const root = findUserAddedRoot(intersects[0].object);
      if (!root) return;

      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -root.position.y);
      const pt = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, pt)) return;

      dragStateRef.current = {
        object: root,
        plane,
        offset: new THREE.Vector3(root.position.x - pt.x, 0, root.position.z - pt.z),
      };
      controls.enabled = false;
      renderer.domElement.style.cursor = "grabbing";
      setHint("Kéo để di chuyển · Lăn chuột để xoay");
    };

    const handlePointerUp = () => {
      if (dragStateRef.current) {
        dragStateRef.current = null;
        controls.enabled = true;
        renderer.domElement.style.cursor = "auto";
        setHint(null);
      }
    };

    // Khi dang keo (giu chuot trai tren vat the), lan chuot se XOAY vat do
    // quanh truc dung thay vi zoom camera - cho phep xoay huong do vat
    // ngay trong luc dang dat vi tri.
    const handleWheel = (e: WheelEvent) => {
      if (!dragStateRef.current) return;
      e.preventDefault();
      dragStateRef.current.object.rotation.y += e.deltaY * 0.002;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelPlacingWall();
        setMenu(null);
      }
    };

    renderer.domElement.addEventListener("contextmenu", handleContextMenu);
    renderer.domElement.addEventListener("click", handleClick);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("keydown", handleKeyDown);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // Expose actions for the React-rendered context menu to call.
    actionsRef.current = {
      addFurniture: (type: FurnitureType, point: THREE.Vector3) => {
        const item = createFurniture(type);
        item.position.set(point.x, 0, point.z);
        userGroupRef.current.add(item);
      },
      startWall: (point: THREE.Vector3) => {
        pendingWallRef.current = { start: point.clone().setY(0) };
        setHint("Click vào sàn để chọn điểm kết thúc tường (Esc để huỷ)");
      },
      addDoor: (point: THREE.Vector3, normal?: THREE.Vector3) => {
        const door = createDoorMarker();
        door.position.set(point.x, 0, point.z);
        if (normal) {
          door.rotation.y = Math.atan2(normal.x, normal.z);
        }
        userGroupRef.current.add(door);
      },
      removeObject: (obj: THREE.Object3D) => {
        userGroupRef.current.remove(obj);
      },
    };

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("contextmenu", handleContextMenu);
      renderer.domElement.removeEventListener("click", handleClick);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl]);

  const menuOpenRef = useRef(false);
  useEffect(() => {
    menuOpenRef.current = menu !== null;
    if (!menu) setFurnitureSubmenu(false);
  }, [menu]);

  const actionsRef = useRef<{
    addFurniture: (type: FurnitureType, point: THREE.Vector3) => void;
    startWall: (point: THREE.Vector3) => void;
    addDoor: (point: THREE.Vector3, normal?: THREE.Vector3) => void;
    removeObject: (obj: THREE.Object3D) => void;
  } | null>(null);

  const closeMenu = () => {
    setMenu(null);
    setFurnitureSubmenu(false);
  };

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: 460, position: "relative" }}
      onClick={() => {
        if (menu) closeMenu();
      }}
    >
      {hint && <div className="viewer-floating-hint">{hint}</div>}

      {menu && (
        <div
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.surface === "object" ? (
            <button
              className="context-menu-item"
              onClick={() => {
                if (menu.targetObject) actionsRef.current?.removeObject(menu.targetObject);
                closeMenu();
              }}
            >
              🗑️ Xoá vật thể này
            </button>
          ) : (
            <>
              <div
                className="context-menu-item has-submenu"
                onMouseEnter={() => setFurnitureSubmenu(true)}
              >
                🪑 Thêm nội thất ▸
                {furnitureSubmenu && (
                  <div className="context-submenu">
                    {(Object.keys(FURNITURE_LABELS) as FurnitureType[]).map((type) => (
                      <button
                        key={type}
                        className="context-menu-item"
                        onClick={() => {
                          actionsRef.current?.addFurniture(type, menu.point);
                          closeMenu();
                        }}
                      >
                        {FURNITURE_LABELS[type]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                className="context-menu-item"
                disabled={menu.surface !== "wall"}
                onClick={() => {
                  if (menu.surface === "wall") {
                    actionsRef.current?.addDoor(menu.point, menu.normal);
                    closeMenu();
                  }
                }}
              >
                🚪 Thêm cửa tại đây
              </button>

              <button
                className="context-menu-item"
                onClick={() => {
                  actionsRef.current?.startWall(menu.point);
                  closeMenu();
                }}
              >
                🧱 Vẽ tường mới từ đây
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
