import * as THREE from "three";

export type FurnitureType = "ban" | "ghe" | "giuong" | "sofa" | "tu";

export const FURNITURE_LABELS: Record<FurnitureType, string> = {
  ban: "Bàn",
  ghe: "Ghế",
  giuong: "Giường",
  sofa: "Sofa",
  tu: "Tủ",
};

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.position.y = h / 2;
  return mesh;
}

function addLegs(group: THREE.Group, w: number, d: number, legHeight: number, color: number, inset = 0.05) {
  const legSize = 0.05;
  const positions = [
    [w / 2 - inset, d / 2 - inset],
    [-(w / 2 - inset), d / 2 - inset],
    [w / 2 - inset, -(d / 2 - inset)],
    [-(w / 2 - inset), -(d / 2 - inset)],
  ];
  for (const [x, z] of positions) {
    const leg = box(legSize, legHeight, legSize, color);
    leg.position.set(x, legHeight / 2, z);
    group.add(leg);
  }
}

function buildTable(): THREE.Group {
  const g = new THREE.Group();
  const legHeight = 0.72;
  addLegs(g, 1.2, 0.7, legHeight, 0x5c4328);
  const top = box(1.2, 0.05, 0.7, 0x8a5a3b);
  top.position.y = legHeight + 0.025;
  g.add(top);
  return g;
}

function buildChair(): THREE.Group {
  const g = new THREE.Group();
  const legHeight = 0.45;
  addLegs(g, 0.42, 0.42, legHeight, 0x4a3827, 0.03);
  const seat = box(0.42, 0.04, 0.42, 0x6b4f33);
  seat.position.y = legHeight + 0.02;
  g.add(seat);
  const back = box(0.42, 0.4, 0.04, 0x6b4f33);
  back.position.set(0, legHeight + 0.22, -0.19);
  g.add(back);
  return g;
}

function buildBed(): THREE.Group {
  const g = new THREE.Group();
  const frame = box(1.6, 0.35, 2.0, 0x6b7fa3);
  g.add(frame);
  const mattress = box(1.55, 0.12, 1.95, 0xe7e2d6);
  mattress.position.y = 0.35 + 0.06;
  g.add(mattress);
  const pillow = box(1.5, 0.08, 0.35, 0xffffff);
  pillow.position.set(0, 0.35 + 0.12 + 0.04, -0.78);
  g.add(pillow);
  return g;
}

function buildSofa(): THREE.Group {
  const g = new THREE.Group();
  const base = box(1.8, 0.4, 0.85, 0x4f6358);
  g.add(base);
  const backRest = box(1.8, 0.45, 0.2, 0x44584e);
  backRest.position.set(0, 0.4 + 0.22, -0.32);
  g.add(backRest);
  const armL = box(0.18, 0.55, 0.85, 0x44584e);
  armL.position.set(-0.81, 0.27, 0);
  g.add(armL);
  const armR = box(0.18, 0.55, 0.85, 0x44584e);
  armR.position.set(0.81, 0.27, 0);
  g.add(armR);
  return g;
}

function buildCabinet(): THREE.Group {
  const g = new THREE.Group();
  const body = box(1.0, 1.8, 0.5, 0x7a6a52);
  g.add(body);
  const doorGap = 0.02;
  const doorL = box(0.48 - doorGap, 1.7, 0.03, 0x5c4d3a);
  doorL.position.set(-0.25, 0.9, 0.25);
  g.add(doorL);
  const doorR = box(0.48 - doorGap, 1.7, 0.03, 0x5c4d3a);
  doorR.position.set(0.25, 0.9, 0.25);
  g.add(doorR);
  return g;
}

export function createFurniture(type: FurnitureType): THREE.Group {
  let group: THREE.Group;
  switch (type) {
    case "ban":
      group = buildTable();
      break;
    case "ghe":
      group = buildChair();
      break;
    case "giuong":
      group = buildBed();
      break;
    case "sofa":
      group = buildSofa();
      break;
    case "tu":
      group = buildCabinet();
      break;
  }
  group.userData.userAdded = true;
  group.userData.kind = "furniture";
  group.userData.furnitureType = type;
  group.traverse((obj) => {
    obj.userData.userAdded = true;
  });
  return group;
}

export function createDoorMarker(): THREE.Group {
  const g = new THREE.Group();
  const frameColor = 0xc9a66b;
  const width = 0.9;
  const height = 2.05;
  const frame = box(width, height, 0.06, frameColor);
  frame.position.y = height / 2;
  g.add(frame);
  const panel = box(width - 0.1, height - 0.1, 0.02, 0xead9b8);
  panel.position.set(0, height / 2, 0.02);
  g.add(panel);
  g.userData.userAdded = true;
  g.userData.kind = "door";
  g.traverse((obj) => {
    obj.userData.userAdded = true;
  });
  return g;
}

export function createWallSegment(
  start: THREE.Vector3,
  end: THREE.Vector3,
  heightM: number,
  thicknessM = 0.1
): THREE.Mesh {
  const length = start.distanceTo(end);
  const geometry = new THREE.BoxGeometry(length, heightM, thicknessM);
  const material = new THREE.MeshStandardMaterial({ color: 0xd2d2d7 });
  const mesh = new THREE.Mesh(geometry, material);

  const mid = start.clone().add(end).multiplyScalar(0.5);
  mesh.position.set(mid.x, heightM / 2, mid.z);

  const dx = end.x - start.x;
  const dz = end.z - start.z;
  mesh.rotation.y = -Math.atan2(dz, dx);

  mesh.userData.userAdded = true;
  mesh.userData.kind = "wall";
  return mesh;
}
