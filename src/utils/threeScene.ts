import * as THREE from 'three';
import type { PlacedFurniture, Position, Room, RoomObstacle } from '../types/layout';
import { getRoomShape, getRoomWallSegments, getSegmentAngle } from './geometry';

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

export function createWallMeshes(room: Room) {
  return getRoomWallSegments(room).map((segment) => {
    const length = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y) * UNIT_SCALE;
    const wallHeight = toWorldLength(WALL_HEIGHT);
    const wallThickness = toWorldLength(WALL_THICKNESS);
    const geometry = new THREE.BoxGeometry(length, wallHeight, wallThickness);
    const material = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.9,
      metalness: 0.01,
    });
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(
      toWorldX(room, (segment.start.x + segment.end.x) / 2),
      wallHeight / 2,
      toWorldZ(room, (segment.start.y + segment.end.y) / 2),
    );
    mesh.rotation.y = -getSegmentAngle(segment) * Math.PI / 180;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  });
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

export function createItemMesh(room: Room, item: PlacedFurniture) {
  const width = toWorldLength(item.width);
  const depth = toWorldLength(item.height);
  const height = Math.max(toWorldLength(item.objectHeight), toWorldLength(4));
  const elevation = toWorldLength(item.elevation);
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(item.color),
    roughness: 0.72,
    metalness: 0.03,
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(
    toWorldX(room, item.x + item.width / 2),
    elevation + height / 2,
    toWorldZ(room, item.y + item.height / 2),
  );
  mesh.rotation.y = -item.rotation * Math.PI / 180;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

export function createRoomSceneObjects(room: Room, items: PlacedFurniture[]) {
  return [
    createFloorMesh(room),
    ...createWallMeshes(room),
    ...createObstacleMeshes(room),
    ...items.map((item) => createItemMesh(room, item)),
  ];
}
