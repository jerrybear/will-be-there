import * as THREE from 'three';
import type { PlacedFurniture, Position, Room, RoomObstacle } from '../types/layout';
import { getItemPlacementRect, getRoomShape, getRoomWallSegments, getSegmentAngle, getNearestWallProjection, projectItemToWallLocal } from './geometry';
import type { WallSegment } from './geometry';

const UNIT_SCALE = 0.01;
const WALL_HEIGHT = 240;
const WALL_THICKNESS = 6;

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

interface WallOpening {
  itemId: string;
  /** Distance from wall start to opening center, in room units */
  centerAlongWall: number;
  /** Opening width in room units */
  width: number;
  /** Opening height in room units */
  height: number;
  /** Elevation from floor in room units */
  elevation: number;
  /** Whether this is a window (to add glass panel) */
  isWindow: boolean;
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
      height: item.objectHeight,
      elevation: item.elevation,
      isWindow: item.kind === 'window',
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

export function createWallMeshes(room: Room, items: PlacedFurniture[], selectedId: string | null = null) {
  const segments = getRoomWallSegments(room);
  const openingsMap = getOpeningsByWall(room, items, segments);
  const wallThickness = toWorldLength(WALL_THICKNESS);
  const wallHeight = toWorldLength(WALL_HEIGHT);
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

    // The shape was built in local 2D (X=along wall, Y=up).
    // ExtrudeGeometry extrudes along Z.
    // We need to:
    // 1. Center the wall along its length (translate X by -segmentLength/2)
    // 2. Offset Z by -wallThickness/2 so the wall is centered on the line
    // 3. Rotate around Y to match wall angle
    // 4. Translate to world position (center of the segment)

    const group = new THREE.Group();
    group.add(wallMesh);

    // Center the extruded shape
    wallMesh.position.set(-segmentLength / 2, 0, -wallThickness / 2);

    // Add glass panels for window openings
    for (const opening of openings) {
      if (opening.isWindow) {
        const glass = createGlassPanel(segmentLength, wallHeight, opening, wallThickness);

        if (glass) {
          group.add(glass);
        }
      }

      if (opening.itemId === selectedId) {
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

function createObstacleMesh(room: Room, obstacle: RoomObstacle) {
  if (obstacle.type !== 'rect') {
    return null;
  }

  const height = toWorldLength(WALL_HEIGHT);
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

export function createItemMesh(room: Room, item: PlacedFurniture, isSelected = false) {
  const width = toWorldLength(item.width);
  const depth = toWorldLength(item.height);
  const height = Math.max(toWorldLength(item.objectHeight), toWorldLength(4));
  const elevation = toWorldLength(item.elevation);
  const placementRect = getItemPlacementRect(item, item.x, item.y);
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(item.color),
    emissive: new THREE.Color(isSelected ? 0x1d4ed8 : 0x000000),
    emissiveIntensity: isSelected ? 0.28 : 0,
    roughness: 0.72,
    metalness: 0.03,
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(
    toWorldX(room, placementRect.x + placementRect.width / 2),
    elevation + height / 2,
    toWorldZ(room, placementRect.y + placementRect.height / 2),
  );
  mesh.rotation.y = -item.rotation * Math.PI / 180;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  if (isSelected) {
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x2563eb }),
    );
    mesh.add(outline);
  }

  return mesh;
}

export function createRoomSceneObjects(room: Room, items: PlacedFurniture[], selectedId: string | null = null) {
  // Door/window items are rendered as wall openings, not as separate meshes
  const furnitureItems = items.filter((item) => item.kind === 'furniture');

  return [
    createFloorMesh(room),
    ...createWallMeshes(room, items, selectedId),
    ...createObstacleMeshes(room),
    ...furnitureItems.map((item) => createItemMesh(room, item, item.id === selectedId)),
  ];
}
