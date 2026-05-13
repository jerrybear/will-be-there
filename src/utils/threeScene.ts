import * as THREE from 'three';
import type { PlacedFurniture, Position, Room, RoomObstacle } from '../types/layout';
import { DEFAULT_WALL_HEIGHT, getItemPlacementRect, getRoomShape, getRoomWallSegments, getSegmentAngle, getNearestWallProjection, projectItemToWallLocal } from './geometry';
import type { WallSegment } from './geometry';

const UNIT_SCALE = 0.01;
const WALL_THICKNESS = 6;
const WALL_FADE_OPACITY = 0.28;
const SECONDARY_WALL_DISTANCE_RATIO = 1.28;
const SECONDARY_WALL_ALIGNMENT_DELTA = 0.18;
const MAX_FADED_WALLS = 2;

export function toWorldX(room: Room, x: number) {
  return (x - room.width / 2) * UNIT_SCALE;
}

export function toWorldZ(room: Room, y: number) {
  return (y - room.height / 2) * UNIT_SCALE;
}

export function toWorldLength(value: number) {
  return value * UNIT_SCALE;
}

function toShapePoint(room: Room, point: Position) {
  return new THREE.Vector2(toWorldX(room, point.x), toWorldZ(room, point.y));
}

function getRoomCenterWorld(room: Room) {
  const points = getRoomShape(room).points;
  const averageX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const averageY = points.reduce((sum, point) => sum + point.y, 0) / points.length;

  return new THREE.Vector3(toWorldX(room, averageX), 0, toWorldZ(room, averageY));
}

export function createFloorMesh(room: Room) {
  const shape = new THREE.Shape(getRoomShape(room).points.map((point) => toShapePoint(room, point)));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.86,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;

  return mesh;
}

export function createCeilingShadowBlocker(room: Room) {
  const shape = new THREE.Shape(getRoomShape(room).points.map((point) => toShapePoint(room, point)));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
  material.colorWrite = false;
  material.depthWrite = false;
  material.depthTest = false;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = toWorldLength(room.wallHeight ?? DEFAULT_WALL_HEIGHT);
  mesh.castShadow = true;
  mesh.receiveShadow = false;

  return mesh;
}

interface WallOpening {
  itemId: string;
  /** Distance from wall start to opening center, in room units */
  centerAlongWall: number;
  /** Opening width in room units */
  width: number;
  /** Door/window thickness in room units */
  depth: number;
  /** Opening height in room units */
  height: number;
  /** Elevation from floor in room units */
  elevation: number;
  /** Whether this is a window (to add glass panel) */
  isWindow: boolean;
  isDoor: boolean;
  doorHinge?: 'left' | 'right';
  doorSwingDir?: 'front' | 'back';
  doorOpenAngle?: number;
}

/**
 * Resolve which wall segment a door/window belongs to.
 * Uses wallSegmentId if available, otherwise finds the nearest wall.
 */
function resolveWallSegment(
  room: Room,
  item: PlacedFurniture,
  segments: WallSegment[],
): WallSegment | null {
  if (item.wallSegmentId) {
    const match = segments.find((s) => s.id === item.wallSegmentId);
    if (match) return match;
  }

  const placementRect = getItemPlacementRect(item, item.x, item.y);
  const centerX = placementRect.x + placementRect.width / 2;
  const centerY = placementRect.y + placementRect.height / 2;
  const projection = getNearestWallProjection(room, { x: centerX, y: centerY });
  return projection ? projection.segment : null;
}

/**
 * Groups door/window items by wall segment and returns openings per segment.
 */
function getOpeningsByWall(
  room: Room,
  items: PlacedFurniture[],
  segments: WallSegment[],
): Map<string, WallOpening[]> {
  const map = new Map<string, WallOpening[]>();

  const wallItems = items.filter((item) => item.kind === 'door' || item.kind === 'window');

  for (const item of wallItems) {
    const segment = resolveWallSegment(room, item, segments);
    if (!segment) continue;

    const centerAlongWall = projectItemToWallLocal(segment, item);

    const opening: WallOpening = {
      itemId: item.id,
      centerAlongWall,
      width: item.width,
      depth: item.height,
      height: item.objectHeight,
      elevation: item.elevation,
      isWindow: item.kind === 'window',
      isDoor: item.kind === 'door',
      doorHinge: item.doorHinge,
      doorSwingDir: item.doorSwingDir,
      doorOpenAngle: item.doorOpenAngle,
    };

    const existing = map.get(segment.id);
    if (existing) {
      existing.push(opening);
    } else {
      map.set(segment.id, [opening]);
    }
  }

  return map;
}

/**
 * Creates a wall shape (in wall-local 2D space: width × height) with holes for openings.
 * The shape lies in the XY plane: X = along wall, Y = up.
 */
function createWallShapeWithOpenings(
  wallLength: number,
  wallHeight: number,
  openings: WallOpening[],
): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(wallLength, 0);
  shape.lineTo(wallLength, wallHeight);
  shape.lineTo(0, wallHeight);
  shape.closePath();

  for (const opening of openings) {
    const halfW = toWorldLength(opening.width) / 2;
    const center = toWorldLength(opening.centerAlongWall);
    const left = Math.max(0, center - halfW);
    const right = Math.min(wallLength, center + halfW);
    const bottom = toWorldLength(opening.elevation);
    const top = Math.min(wallHeight, toWorldLength(opening.elevation + opening.height));

    // Skip degenerate openings
    if (right - left < 0.001 || top - bottom < 0.001) continue;

    const hole = new THREE.Path();
    hole.moveTo(left, bottom);
    hole.lineTo(right, bottom);
    hole.lineTo(right, top);
    hole.lineTo(left, top);
    hole.closePath();
    shape.holes.push(hole);
  }

  return shape;
}

/**
 * Creates a glass panel mesh for a window opening, positioned in wall-local space.
 */
function createGlassPanel(
  wallLength: number,
  wallHeight: number,
  opening: WallOpening,
  wallThickness: number,
): THREE.Mesh | null {
  const halfW = toWorldLength(opening.width) / 2;
  const center = toWorldLength(opening.centerAlongWall);
  const left = Math.max(0, center - halfW);
  const right = Math.min(wallLength, center + halfW);
  const bottom = toWorldLength(opening.elevation);
  const top = Math.min(wallHeight, toWorldLength(opening.elevation + opening.height));

  const panelWidth = right - left;
  const panelHeight = top - bottom;

  if (panelWidth < 0.001 || panelHeight < 0.001) {
    return null;
  }

  const geometry = new THREE.PlaneGeometry(panelWidth, panelHeight);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.25,
    roughness: 0.05,
    metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);

  // Position at center of opening, in wall-local space
  // X = along wall, Y = up, Z = through wall
  mesh.position.set(
    (left + right) / 2 - wallLength / 2,
    bottom + panelHeight / 2,
    wallThickness / 2,
  );

  return mesh;
}

function createOpeningOutline(
  wallLength: number,
  wallHeight: number,
  opening: WallOpening,
  wallThickness: number,
): THREE.LineSegments | null {
  const halfW = toWorldLength(opening.width) / 2;
  const center = toWorldLength(opening.centerAlongWall);
  const left = Math.max(0, center - halfW);
  const right = Math.min(wallLength, center + halfW);
  const bottom = toWorldLength(opening.elevation);
  const top = Math.min(wallHeight, toWorldLength(opening.elevation + opening.height));

  if (right - left < 0.001 || top - bottom < 0.001) {
    return null;
  }

  const z = wallThickness / 2 + 0.004;
  const points = [
    new THREE.Vector3(left - wallLength / 2, bottom, z),
    new THREE.Vector3(right - wallLength / 2, bottom, z),
    new THREE.Vector3(right - wallLength / 2, bottom, z),
    new THREE.Vector3(right - wallLength / 2, top, z),
    new THREE.Vector3(right - wallLength / 2, top, z),
    new THREE.Vector3(left - wallLength / 2, top, z),
    new THREE.Vector3(left - wallLength / 2, top, z),
    new THREE.Vector3(left - wallLength / 2, bottom, z),
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0x2563eb });

  return new THREE.LineSegments(geometry, material);
}

function createDoorLeaf(
  wallLength: number,
  wallHeight: number,
  opening: WallOpening,
  wallThickness: number,
): THREE.Group | null {
  if (!opening.isDoor) {
    return null;
  }

  const halfW = toWorldLength(opening.width) / 2;
  const center = toWorldLength(opening.centerAlongWall);
  const left = Math.max(0, center - halfW);
  const right = Math.min(wallLength, center + halfW);
  const bottom = toWorldLength(opening.elevation);
  const top = Math.min(wallHeight, toWorldLength(opening.elevation + opening.height));
  const panelWidth = right - left;
  const panelHeight = top - bottom;

  if (panelWidth < 0.001 || panelHeight < 0.001) {
    return null;
  }

  const leafThickness = Math.max(toWorldLength(opening.depth), toWorldLength(4));
  const hinge = opening.doorHinge ?? 'left';
  const swingDir = opening.doorSwingDir ?? 'front';
  const openAngle = THREE.MathUtils.degToRad(opening.doorOpenAngle ?? 90);
  const hingeOffsetX = hinge === 'left' ? left - wallLength / 2 : right - wallLength / 2;
  const panelOffsetX = hinge === 'left' ? panelWidth / 2 : -panelWidth / 2;
  const panelOffsetZ = swingDir === 'front'
    ? -leafThickness / 2
    : leafThickness / 2;
  const rotationDirection = hinge === 'left'
    ? (swingDir === 'front' ? 1 : -1)
    : (swingDir === 'front' ? -1 : 1);

  const pivot = new THREE.Group();
  pivot.userData.doorLeafFor = opening.itemId;
  pivot.userData.doorLeafOpenAngle = opening.doorOpenAngle ?? 90;

  const material = new THREE.MeshStandardMaterial({
    color: 0xd6c2a7,
    roughness: 0.62,
    metalness: 0.03,
  });
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(panelWidth, panelHeight, leafThickness), material);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  leaf.userData.isDoorLeaf = true;
  leaf.position.set(panelOffsetX, bottom + panelHeight / 2, panelOffsetZ);

  const handleMaterial = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.34,
    metalness: 0.72,
  });
  const handleWidth = Math.max(panelWidth * 0.045, toWorldLength(2.2));
  const handleHeight = Math.max(panelHeight * 0.08, toWorldLength(12));
  const handleDepth = Math.max(leafThickness * 0.45, toWorldLength(1.4));
  const handleOffsetX = hinge === 'left'
    ? panelWidth * 0.34
    : -panelWidth * 0.34;
  const handleOffsetZ = panelOffsetZ >= 0
    ? leafThickness / 2 + handleDepth / 2
    : -leafThickness / 2 - handleDepth / 2;

  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(handleWidth, handleHeight, handleDepth),
    handleMaterial,
  );
  handle.castShadow = true;
  handle.receiveShadow = true;
  handle.userData.isDoorHandle = true;
  handle.position.set(handleOffsetX, bottom + panelHeight * 0.52, handleOffsetZ);

  pivot.position.set(hingeOffsetX, 0, 0);
  pivot.rotation.y = rotationDirection * openAngle;
  pivot.add(leaf);
  pivot.add(handle);

  return pivot;
}

export function createWallMeshes(room: Room, items: PlacedFurniture[], selectedId: string | null = null) {
  const segments = getRoomWallSegments(room);
  const openingsMap = getOpeningsByWall(room, items, segments);
  const wallThickness = toWorldLength(WALL_THICKNESS);
  const wallHeight = toWorldLength(room.wallHeight ?? DEFAULT_WALL_HEIGHT);
  const meshes: THREE.Object3D[] = [];

  for (const segment of segments) {
    const segmentLength = Math.hypot(
      segment.end.x - segment.start.x,
      segment.end.y - segment.start.y,
    ) * UNIT_SCALE;

    const openings = openingsMap.get(segment.id) ?? [];
    const shape = createWallShapeWithOpenings(segmentLength, wallHeight, openings);

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: wallThickness,
      bevelEnabled: false,
    });

    const material = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.9,
      metalness: 0.01,
    });

    const wallMesh = new THREE.Mesh(geometry, material);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;

    const shadowBlockerMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    shadowBlockerMaterial.colorWrite = false;
    shadowBlockerMaterial.depthWrite = false;
    shadowBlockerMaterial.depthTest = false;
    const shadowBlocker = new THREE.Mesh(geometry, shadowBlockerMaterial);
    shadowBlocker.castShadow = false;
    shadowBlocker.receiveShadow = false;

    // The shape was built in local 2D (X=along wall, Y=up).
    // ExtrudeGeometry extrudes along Z.
    // We need to:
    // 1. Center the wall along its length (translate X by -segmentLength/2)
    // 2. Offset Z by -wallThickness/2 so the wall is centered on the line
    // 3. Rotate around Y to match wall angle
    // 4. Translate to world position (center of the segment)

    const group = new THREE.Group();
    group.add(wallMesh);
    group.add(shadowBlocker);
    group.userData.wallSegmentId = segment.id;
    group.userData.wallMaterial = material;
    group.userData.wallShadowMeshes = [wallMesh];
    group.userData.wallShadowBlocker = shadowBlocker;

    // Center the extruded shape
    wallMesh.position.set(-segmentLength / 2, 0, -wallThickness / 2);
    shadowBlocker.position.copy(wallMesh.position);

    // Add glass panels for window openings
    for (const opening of openings) {
      if (opening.isWindow) {
        const glass = createGlassPanel(segmentLength, wallHeight, opening, wallThickness);

        if (glass) {
          group.add(glass);
        }
      }

      if (opening.itemId === selectedId) {
        if (opening.isDoor) {
          const doorLeaf = createDoorLeaf(segmentLength, wallHeight, opening, wallThickness);

          if (doorLeaf) {
            group.add(doorLeaf);
          }
        }

        const outline = createOpeningOutline(segmentLength, wallHeight, opening, wallThickness);

        if (outline) {
          group.add(outline);
        }
      }
    }

    // Position and rotate group in world space
    group.position.set(
      toWorldX(room, (segment.start.x + segment.end.x) / 2),
      0,
      toWorldZ(room, (segment.start.y + segment.end.y) / 2),
    );
    group.rotation.y = -getSegmentAngle(segment) * Math.PI / 180;

    meshes.push(group);
  }

  return meshes;
}

function getSegmentCenterWorld(room: Room, segment: WallSegment) {
  return new THREE.Vector3(
    toWorldX(room, (segment.start.x + segment.end.x) / 2),
    0,
    toWorldZ(room, (segment.start.y + segment.end.y) / 2),
  );
}

function getInwardNormal(room: Room, segment: WallSegment) {
  const start = new THREE.Vector3(toWorldX(room, segment.start.x), 0, toWorldZ(room, segment.start.y));
  const end = new THREE.Vector3(toWorldX(room, segment.end.x), 0, toWorldZ(room, segment.end.y));
  const direction = end.clone().sub(start).normalize();
  const normalA = new THREE.Vector3(-direction.z, 0, direction.x);
  const normalB = new THREE.Vector3(direction.z, 0, -direction.x);
  const toCenter = getRoomCenterWorld(room).sub(getSegmentCenterWorld(room, segment));

  return normalA.dot(toCenter) >= normalB.dot(toCenter) ? normalA.normalize() : normalB.normalize();
}

function getAdjacentWallSegmentIds(room: Room, segmentId: string) {
  const segments = getRoomWallSegments(room);
  const segmentIndex = segments.findIndex((segment) => segment.id === segmentId);

  if (segmentIndex === -1) {
    return new Set<string>();
  }

  const previous = segments[(segmentIndex - 1 + segments.length) % segments.length];
  const next = segments[(segmentIndex + 1) % segments.length];

  return new Set([previous.id, next.id]);
}

export function getFrontWallSegmentIds(
  room: Room,
  cameraPosition: THREE.Vector3,
  cameraForward: THREE.Vector3,
) {
  const normalizedForward = cameraForward.clone().normalize();
  const candidates: Array<{ segmentId: string; projectedDistance: number; alignment: number }> = [];

  for (const segment of getRoomWallSegments(room)) {
    const center = getSegmentCenterWorld(room, segment);
    const toWall = center.clone().sub(cameraPosition);
    const projectedDistance = toWall.dot(normalizedForward);

    if (projectedDistance <= 0) {
      continue;
    }

    const inwardNormal = getInwardNormal(room, segment);
    const cameraSide = cameraPosition.clone().sub(center).dot(inwardNormal);

    if (cameraSide >= 0) {
      continue;
    }

    const alignment = toWall.clone().normalize().dot(normalizedForward);

    if (alignment < 0.4) {
      continue;
    }

    candidates.push({
      segmentId: segment.id,
      projectedDistance,
      alignment,
    });
  }

  if (candidates.length === 0) {
    return [];
  }

  candidates.sort((left, right) => {
    if (Math.abs(left.projectedDistance - right.projectedDistance) > 0.0001) {
      return left.projectedDistance - right.projectedDistance;
    }

    return right.alignment - left.alignment;
  });

  const primary = candidates[0];
  const adjacentSegmentIds = getAdjacentWallSegmentIds(room, primary.segmentId);

  return candidates
    .filter((candidate) => (
      candidate.segmentId === primary.segmentId ||
      (
        adjacentSegmentIds.has(candidate.segmentId) &&
        candidate.projectedDistance <= primary.projectedDistance * SECONDARY_WALL_DISTANCE_RATIO &&
        candidate.alignment >= primary.alignment - SECONDARY_WALL_ALIGNMENT_DELTA
      )
    ))
    .slice(0, MAX_FADED_WALLS)
    .map((candidate) => candidate.segmentId);
}

export function applyWallVisibility(
  wallObjects: THREE.Object3D[],
  fadedSegmentIds: string | string[] | null,
  fadeOpacity = WALL_FADE_OPACITY,
) {
  const fadedSet = new Set(
    typeof fadedSegmentIds === 'string'
      ? [fadedSegmentIds]
      : (fadedSegmentIds ?? []),
  );

  wallObjects.forEach((wallObject) => {
    const material = wallObject.userData.wallMaterial as THREE.MeshStandardMaterial | undefined;
    const shadowMeshes = wallObject.userData.wallShadowMeshes as THREE.Mesh[] | undefined;
    const shadowBlocker = wallObject.userData.wallShadowBlocker as THREE.Mesh | undefined;

    if (!material) {
      return;
    }

    const isFaded = fadedSet.has(wallObject.userData.wallSegmentId as string);
    material.transparent = isFaded;
    material.opacity = isFaded ? fadeOpacity : 1;
    material.depthWrite = !isFaded;
    material.needsUpdate = true;

    shadowMeshes?.forEach((mesh) => {
      mesh.castShadow = !isFaded;
    });
    if (shadowBlocker) {
      shadowBlocker.castShadow = isFaded;
    }
  });
}

function createObstacleMesh(room: Room, obstacle: RoomObstacle) {
  if (obstacle.type !== 'rect') {
    return null;
  }

  const height = toWorldLength(room.wallHeight ?? DEFAULT_WALL_HEIGHT);
  const geometry = new THREE.BoxGeometry(toWorldLength(obstacle.width), height, toWorldLength(obstacle.height));
  const material = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.82,
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(
    toWorldX(room, obstacle.x + obstacle.width / 2),
    height / 2,
    toWorldZ(room, obstacle.y + obstacle.height / 2),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

export function createObstacleMeshes(room: Room) {
  return getRoomShape(room).obstacles.flatMap((obstacle) => {
    const mesh = createObstacleMesh(room, obstacle);
    return mesh ? [mesh] : [];
  });
}

function createFurnitureMaterial(item: PlacedFurniture, isSelected: boolean) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(item.color),
    emissive: new THREE.Color(isSelected ? 0x1d4ed8 : 0x000000),
    emissiveIntensity: isSelected ? 0.28 : 0,
    roughness: 0.72,
    metalness: 0.03,
  });
}

function addSelectionOutline(group: THREE.Group, width: number, height: number, depth: number) {
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)),
    new THREE.LineBasicMaterial({ color: 0x2563eb }),
  );
  group.add(outline);
}

function createDeskNeominGroup(item: PlacedFurniture, width: number, depth: number, height: number, isSelected: boolean) {
  const group = new THREE.Group();
  const mainMaterial = createFurnitureMaterial(item, isSelected);
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0x4b5563,
    roughness: 0.85,
    metalness: 0.06,
  });

  const topThickness = Math.max(height * 0.08, toWorldLength(3));
  const sideThickness = Math.max(width * 0.08, toWorldLength(3));
  const modestyThickness = Math.max(depth * 0.06, toWorldLength(2));

  const top = new THREE.Mesh(new THREE.BoxGeometry(width, topThickness, depth), mainMaterial);
  top.position.y = height / 2 - topThickness / 2;
  group.add(top);

  const leftPanel = new THREE.Mesh(new THREE.BoxGeometry(sideThickness, height - topThickness, depth), mainMaterial);
  leftPanel.position.set(-width / 2 + sideThickness / 2, -topThickness / 2, 0);
  group.add(leftPanel);

  const rightPanel = leftPanel.clone();
  rightPanel.position.x = width / 2 - sideThickness / 2;
  group.add(rightPanel);

  const modesty = new THREE.Mesh(
    new THREE.BoxGeometry(width - sideThickness * 2.4, height * 0.42, modestyThickness),
    accentMaterial,
  );
  modesty.position.set(0, -height * 0.12, depth / 2 - modestyThickness / 2);
  group.add(modesty);

  if (isSelected) {
    addSelectionOutline(group, width, height, depth);
  }

  return group;
}

function createDeskFourLegGroup(item: PlacedFurniture, width: number, depth: number, height: number, isSelected: boolean) {
  const group = new THREE.Group();
  const topMaterial = createFurnitureMaterial(item, isSelected);
  const legMaterial = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.78,
    metalness: 0.08,
  });

  const topThickness = Math.max(height * 0.08, toWorldLength(3));
  const legSize = Math.max(Math.min(width, depth) * 0.08, toWorldLength(3));
  const legHeight = Math.max(height - topThickness, toWorldLength(12));
  const offsetX = width / 2 - legSize;
  const offsetZ = depth / 2 - legSize;

  const top = new THREE.Mesh(new THREE.BoxGeometry(width, topThickness, depth), topMaterial);
  top.position.y = height / 2 - topThickness / 2;
  group.add(top);

  const legGeometry = new THREE.BoxGeometry(legSize, legHeight, legSize);
  [
    [-offsetX, -topThickness / 2, -offsetZ],
    [offsetX, -topThickness / 2, -offsetZ],
    [-offsetX, -topThickness / 2, offsetZ],
    [offsetX, -topThickness / 2, offsetZ],
  ].forEach(([x, y, z]) => {
    const leg = new THREE.Mesh(legGeometry, legMaterial);
    leg.position.set(x, y, z);
    group.add(leg);
  });

  if (isSelected) {
    addSelectionOutline(group, width, height, depth);
  }

  return group;
}

function createBedFrameGroup(item: PlacedFurniture, width: number, depth: number, height: number, isSelected: boolean) {
  const group = new THREE.Group();
  const frameMaterial = createFurnitureMaterial(item, isSelected);
  const mattressMaterial = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.95,
    metalness: 0.01,
  });

  const frameHeight = Math.max(height * 0.38, toWorldLength(10));
  const mattressHeight = Math.max(height * 0.42, toWorldLength(8));
  const headboardHeight = Math.max(height * 1.25, toWorldLength(28));
  const headboardThickness = Math.max(depth * 0.06, toWorldLength(3));

  const frame = new THREE.Mesh(new THREE.BoxGeometry(width, frameHeight, depth), frameMaterial);
  frame.position.y = -height / 2 + frameHeight / 2;
  group.add(frame);

  const mattress = new THREE.Mesh(new THREE.BoxGeometry(width * 0.94, mattressHeight, depth * 0.92), mattressMaterial);
  mattress.position.y = -height / 2 + frameHeight + mattressHeight / 2 - toWorldLength(1);
  group.add(mattress);

  const headboard = new THREE.Mesh(new THREE.BoxGeometry(width, headboardHeight, headboardThickness), frameMaterial);
  headboard.position.set(0, -height / 2 + headboardHeight / 2, -depth / 2 + headboardThickness / 2);
  group.add(headboard);

  if (isSelected) {
    addSelectionOutline(group, width, Math.max(headboardHeight, height), depth);
  }

  return group;
}

function createSofaCushionGroup(item: PlacedFurniture, width: number, depth: number, height: number, isSelected: boolean) {
  const group = new THREE.Group();
  const baseMaterial = createFurnitureMaterial(item, isSelected);
  const cushionMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(item.color).offsetHSL(0, -0.04, 0.08),
    roughness: 0.84,
    metalness: 0.02,
  });

  const baseHeight = Math.max(height * 0.34, toWorldLength(10));
  const seatHeight = Math.max(height * 0.28, toWorldLength(7));
  const backHeight = Math.max(height * 0.58, toWorldLength(14));
  const armWidth = Math.max(width * 0.12, toWorldLength(6));

  const base = new THREE.Mesh(new THREE.BoxGeometry(width, baseHeight, depth), baseMaterial);
  base.position.y = -height / 2 + baseHeight / 2;
  group.add(base);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(width - armWidth * 2, seatHeight, depth * 0.7), cushionMaterial);
  seat.position.y = -height / 2 + baseHeight + seatHeight / 2;
  group.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(width, backHeight, depth * 0.18), baseMaterial);
  back.position.set(0, -height / 2 + backHeight / 2 + baseHeight * 0.55, -depth / 2 + depth * 0.09);
  group.add(back);

  const armGeometry = new THREE.BoxGeometry(armWidth, backHeight * 0.82, depth * 0.88);
  const leftArm = new THREE.Mesh(armGeometry, baseMaterial);
  leftArm.position.set(-width / 2 + armWidth / 2, -height / 2 + armGeometry.parameters.height / 2 + baseHeight * 0.35, 0);
  group.add(leftArm);

  const rightArm = leftArm.clone();
  rightArm.position.x = width / 2 - armWidth / 2;
  group.add(rightArm);

  if (isSelected) {
    addSelectionOutline(group, width, Math.max(backHeight, height), depth);
  }

  return group;
}

function createStorageBodyMaterials(item: PlacedFurniture, isSelected: boolean) {
  const bodyMaterial = createFurnitureMaterial(item, isSelected);
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0x4b5563,
    roughness: 0.86,
    metalness: 0.04,
  });
  const shadowMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f2a25,
    roughness: 0.92,
    metalness: 0.01,
  });

  return { bodyMaterial, accentMaterial, shadowMaterial };
}

function addCabinetFeet(group: THREE.Group, width: number, depth: number, height: number) {
  const legHeight = Math.max(height * 0.045, toWorldLength(2));
  const legWidth = Math.max(Math.min(width, depth) * 0.028, toWorldLength(1.2));
  const offsetX = width / 2 - legWidth * 1.8;
  const offsetZ = depth / 2 - legWidth * 1.8;
  const legMaterial = new THREE.MeshStandardMaterial({
    color: 0x4b5563,
    roughness: 0.72,
    metalness: 0.18,
  });
  const legGeometry = new THREE.BoxGeometry(legWidth, legHeight, legWidth);

  [
    [-offsetX, -height / 2 + legHeight / 2, -offsetZ],
    [offsetX, -height / 2 + legHeight / 2, -offsetZ],
    [-offsetX, -height / 2 + legHeight / 2, offsetZ],
    [offsetX, -height / 2 + legHeight / 2, offsetZ],
  ].forEach(([x, y, z]) => {
    const leg = new THREE.Mesh(legGeometry, legMaterial);
    leg.position.set(x, y, z);
    group.add(leg);
  });
}

function addDrawerFrontGuides(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  rows: number,
  centerSplitRatio = 0.5,
) {
  const lineThickness = Math.max(Math.min(width, height) * 0.012, toWorldLength(0.8));
  const inset = Math.max(lineThickness * 1.6, toWorldLength(1.6));
  const frontZ = depth / 2 + lineThickness / 2;
  const lineMaterial = new THREE.MeshStandardMaterial({
    color: 0x5b534a,
    roughness: 0.88,
    metalness: 0.03,
  });

  const splitX = -width / 2 + width * centerSplitRatio;
  const vertical = new THREE.Mesh(new THREE.BoxGeometry(lineThickness, height - inset * 2, lineThickness), lineMaterial);
  vertical.position.set(splitX, 0, frontZ);
  group.add(vertical);

  for (let row = 1; row < rows; row += 1) {
    const y = -height / 2 + (height * row) / rows;
    const horizontal = new THREE.Mesh(
      new THREE.BoxGeometry(width - inset * 2, lineThickness, lineThickness),
      lineMaterial,
    );
    horizontal.position.set(0, y, frontZ);
    group.add(horizontal);
  }
}

function createDresserWide3Group(item: PlacedFurniture, width: number, depth: number, height: number, isSelected: boolean) {
  const group = new THREE.Group();
  const { bodyMaterial } = createStorageBodyMaterials(item, isSelected);
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bodyMaterial);
  group.add(body);
  addDrawerFrontGuides(group, width, depth, height, 3, 0.5);
  addCabinetFeet(group, width, depth, height);

  if (isSelected) {
    addSelectionOutline(group, width, height, depth);
  }

  return group;
}

function createDresserTall4Group(item: PlacedFurniture, width: number, depth: number, height: number, isSelected: boolean) {
  const group = new THREE.Group();
  const { bodyMaterial } = createStorageBodyMaterials(item, isSelected);
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bodyMaterial);
  group.add(body);
  addDrawerFrontGuides(group, width, depth, height, 4, 0.5);
  addCabinetFeet(group, width, depth, height);

  if (isSelected) {
    addSelectionOutline(group, width, height, depth);
  }

  return group;
}

function createDresserTall5Group(item: PlacedFurniture, width: number, depth: number, height: number, isSelected: boolean) {
  const group = new THREE.Group();
  const { bodyMaterial } = createStorageBodyMaterials(item, isSelected);
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bodyMaterial);
  group.add(body);
  addDrawerFrontGuides(group, width, depth, height, 5, 0.5);
  addCabinetFeet(group, width, depth, height);

  if (isSelected) {
    addSelectionOutline(group, width, height, depth);
  }

  return group;
}

function createMediaConsoleGroup(item: PlacedFurniture, width: number, depth: number, height: number, isSelected: boolean) {
  const group = new THREE.Group();
  const { bodyMaterial, accentMaterial, shadowMaterial } = createStorageBodyMaterials(item, isSelected);
  const legHeight = Math.max(height * 0.18, toWorldLength(9));
  const cabinetHeight = height - legHeight;
  const leftWidth = width * 0.24;
  const centerWidth = width * 0.18;
  const rightWidth = width - leftWidth - centerWidth;
  const frontZ = depth / 2 + toWorldLength(0.6);

  const leftCabinet = new THREE.Mesh(new THREE.BoxGeometry(leftWidth, cabinetHeight, depth), bodyMaterial);
  leftCabinet.position.set(-width / 2 + leftWidth / 2, legHeight / 2, 0);
  group.add(leftCabinet);

  const rightCabinet = new THREE.Mesh(new THREE.BoxGeometry(rightWidth, cabinetHeight, depth), bodyMaterial);
  rightCabinet.position.set(width / 2 - rightWidth / 2, legHeight / 2, 0);
  group.add(rightCabinet);

  const centerShelf = new THREE.Mesh(new THREE.BoxGeometry(centerWidth, cabinetHeight * 0.92, depth * 0.92), shadowMaterial);
  centerShelf.position.set(-width / 2 + leftWidth + centerWidth / 2, legHeight / 2, 0);
  group.add(centerShelf);

  const centerDivider = new THREE.Mesh(
    new THREE.BoxGeometry(toWorldLength(1.2), cabinetHeight * 0.92, depth * 0.92),
    accentMaterial,
  );
  centerDivider.position.set(-width / 2 + leftWidth + centerWidth / 2, legHeight / 2, 0);
  group.add(centerDivider);

  const rightDrawerLine = new THREE.Mesh(
    new THREE.BoxGeometry(rightWidth - toWorldLength(4), toWorldLength(1.2), toWorldLength(1.2)),
    accentMaterial,
  );
  rightDrawerLine.position.set(width / 2 - rightWidth / 2, legHeight / 2, frontZ);
  group.add(rightDrawerLine);

  const leftDoorLine = new THREE.Mesh(
    new THREE.BoxGeometry(toWorldLength(1.2), cabinetHeight * 0.78, toWorldLength(1.2)),
    accentMaterial,
  );
  leftDoorLine.position.set(-width / 2 + leftWidth / 2, legHeight / 2, frontZ);
  group.add(leftDoorLine);

  addCabinetFeet(group, width, depth, height);

  if (isSelected) {
    addSelectionOutline(group, width, height, depth);
  }

  return group;
}

function createBoxGroup(item: PlacedFurniture, width: number, depth: number, height: number, isSelected: boolean) {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, createFurnitureMaterial(item, isSelected));
  group.add(mesh);

  if (isSelected) {
    addSelectionOutline(group, width, height, depth);
  }

  return group;
}

function createFurnitureGroupByModel(item: PlacedFurniture, width: number, depth: number, height: number, isSelected: boolean) {
  switch (item.threeModel) {
    case 'desk_neomin':
      return createDeskNeominGroup(item, width, depth, height, isSelected);
    case 'desk_four_leg':
      return createDeskFourLegGroup(item, width, depth, height, isSelected);
    case 'bed_frame':
      return createBedFrameGroup(item, width, depth, height, isSelected);
    case 'sofa_cushion':
      return createSofaCushionGroup(item, width, depth, height, isSelected);
    case 'dresser_wide_3':
      return createDresserWide3Group(item, width, depth, height, isSelected);
    case 'dresser_tall_4':
      return createDresserTall4Group(item, width, depth, height, isSelected);
    case 'dresser_tall_5':
      return createDresserTall5Group(item, width, depth, height, isSelected);
    case 'media_console':
      return createMediaConsoleGroup(item, width, depth, height, isSelected);
    case 'box':
    default:
      return createBoxGroup(item, width, depth, height, isSelected);
  }
}

export function createItemMesh(room: Room, item: PlacedFurniture, isSelected = false) {
  const width = toWorldLength(item.width);
  const depth = toWorldLength(item.height);
  const height = Math.max(toWorldLength(item.objectHeight), toWorldLength(4));
  const elevation = toWorldLength(item.elevation);
  const placementRect = getItemPlacementRect(item, item.x, item.y);
  const group = createFurnitureGroupByModel(item, width, depth, height, isSelected);

  group.position.set(
    toWorldX(room, placementRect.x + placementRect.width / 2),
    elevation + height / 2,
    toWorldZ(room, placementRect.y + placementRect.height / 2),
  );
  group.rotation.y = -item.rotation * Math.PI / 180;
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  return group;
}

export function createRoomSceneObjects(room: Room, items: PlacedFurniture[], selectedId: string | null = null) {
  // Door/window items are rendered as wall openings, not as separate meshes
  const furnitureItems = items.filter((item) => item.kind === 'furniture');
  const wallMeshes = createWallMeshes(room, items, selectedId);

  return [
    createFloorMesh(room),
    ...wallMeshes,
    ...createObstacleMeshes(room),
    ...furnitureItems.map((item) => createItemMesh(room, item, item.id === selectedId)),
  ];
}
