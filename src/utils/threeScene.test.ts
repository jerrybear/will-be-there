import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createRectRoom } from './geometry';
import { applyWallVisibility, createRoomSceneObjects, getFrontWallSegmentIds } from './threeScene';
import type { PlacedFurniture, Room } from '../types/layout';

function getFurnitureGroup(item: PlacedFurniture) {
  const room = createRectRoom(720, 480) as Room;
  const objects = createRoomSceneObjects(room, [item], item.id);
  return objects[objects.length - 1] as THREE.Group;
}

describe('threeScene detailed models', () => {
  it('renders a detailed desk model with multiple meshes', () => {
    const group = getFurnitureGroup({
      id: 'desk-1',
      templateId: 'desk-neomin',
      label: '네오민 책상',
      color: '#6bc3a2',
      kind: 'furniture',
      threeModel: 'desk_neomin',
      objectHeight: 74,
      elevation: 0,
      width: 140,
      height: 70,
      rotation: 0,
      x: 20,
      y: 20,
    });

    expect(group.children.filter((child) => child instanceof THREE.Mesh).length).toBeGreaterThan(1);
  });

  it('keeps box model for generic custom furniture', () => {
    const group = getFurnitureGroup({
      id: 'custom-1',
      templateId: 'custom-furniture-1',
      label: '협탁',
      color: '#94a3b8',
      kind: 'furniture',
      threeModel: 'box',
      objectHeight: 52,
      elevation: 0,
      width: 48,
      height: 40,
      rotation: 0,
      x: 40,
      y: 40,
    });

    expect(group.children.some((child) => child instanceof THREE.Mesh)).toBe(true);
  });

  it('selects the nearest front wall for auto fade', () => {
    const room = createRectRoom(720, 480) as Room;
    const cameraPosition = new THREE.Vector3(0, 1, 5);
    const cameraForward = new THREE.Vector3(0, 0, -1);

    expect(getFrontWallSegmentIds(room, cameraPosition, cameraForward)).toEqual(['point-2-point-3']);
  });

  it('allows two adjacent front walls to fade together near a corner', () => {
    const room = createRectRoom(720, 480) as Room;
    const cameraPosition = new THREE.Vector3(6, 1, 6);
    const cameraForward = new THREE.Vector3(-1, 0, -1).normalize();

    const fadedWallIds = getFrontWallSegmentIds(room, cameraPosition, cameraForward);

    expect(fadedWallIds).toHaveLength(2);
    expect(fadedWallIds).toEqual(
      expect.arrayContaining(['point-1-point-2', 'point-2-point-3']),
    );
  });

  it('does not fade more than two walls even in corner-biased views', () => {
    const room = createRectRoom(720, 480) as Room;
    const cameraPosition = new THREE.Vector3(6, 1, 6);
    const cameraForward = new THREE.Vector3(-0.8, 0, -1).normalize();

    expect(getFrontWallSegmentIds(room, cameraPosition, cameraForward)).toHaveLength(2);
  });

  it('applies fade opacity only to the chosen wall', () => {
    const room = createRectRoom(720, 480) as Room;
    const wallObjects = createRoomSceneObjects(room, [], null).filter((object) => object.userData.wallSegmentId);

    applyWallVisibility(wallObjects, 'point-2-point-3');

    const fadedWall = wallObjects.find((object) => object.userData.wallSegmentId === 'point-2-point-3');
    const solidWalls = wallObjects.filter((object) => object.userData.wallSegmentId !== 'point-2-point-3');

    expect((fadedWall?.userData.wallMaterial as THREE.MeshStandardMaterial).opacity).toBeCloseTo(0.28);
    expect(((fadedWall?.userData.wallShadowMeshes as THREE.Mesh[] | undefined) ?? [])[0]?.castShadow).toBe(false);
    expect((fadedWall?.userData.wallShadowBlocker as THREE.Mesh | undefined)?.castShadow).toBe(true);
    solidWalls.forEach((wall) => {
      expect((wall.userData.wallMaterial as THREE.MeshStandardMaterial).opacity).toBe(1);
      expect(((wall.userData.wallShadowMeshes as THREE.Mesh[] | undefined) ?? [])[0]?.castShadow).toBe(true);
      expect((wall.userData.wallShadowBlocker as THREE.Mesh | undefined)?.castShadow).toBe(false);
    });
  });

  it('uses room wallHeight for wall geometry', () => {
    const room = {
      ...createRectRoom(720, 480),
      wallHeight: 320,
    } as Room;
    const wallObjects = createRoomSceneObjects(room, [], null).filter((object) => object.userData.wallSegmentId);
    const firstWallMesh = wallObjects[0].children[0] as THREE.Mesh;
    const geometry = firstWallMesh.geometry as THREE.ExtrudeGeometry;
    geometry.computeBoundingBox();

    expect(geometry.boundingBox?.max.y).toBeCloseTo(3.2, 3);
  });

  it('adds a 3D door leaf only for the selected door', () => {
    const room = createRectRoom(720, 480) as Room;
    const door: PlacedFurniture = {
      id: 'door-1',
      templateId: 'door',
      label: '방문',
      color: '#ffffff',
      kind: 'door',
      threeModel: 'box',
      objectHeight: 210,
      elevation: 0,
      width: 90,
      height: 7,
      rotation: 0,
      x: 0,
      y: 120,
      isWallAttached: true,
      wallSegmentId: 'point-3-point-0',
      doorHinge: 'left',
      doorSwingDir: 'front',
      doorOpenAngle: 90,
    };

    const sceneObjects = createRoomSceneObjects(room, [door], door.id);
    const wallObjects = sceneObjects.filter((object) => object.userData.wallSegmentId);
    const doorWall = wallObjects.find((object) => object.userData.wallSegmentId === 'point-3-point-0');

    expect(doorWall?.children.some((child) => child.userData.doorLeafFor === door.id)).toBe(true);
  });

  it('uses the door thickness value for the 3D door leaf', () => {
    const room = createRectRoom(720, 480) as Room;
    const door: PlacedFurniture = {
      id: 'door-1',
      templateId: 'door',
      label: '방문',
      color: '#ffffff',
      kind: 'door',
      threeModel: 'box',
      objectHeight: 210,
      elevation: 0,
      width: 90,
      height: 7,
      rotation: 0,
      x: 0,
      y: 120,
      isWallAttached: true,
      wallSegmentId: 'point-3-point-0',
      doorHinge: 'left',
      doorSwingDir: 'front',
      doorOpenAngle: 90,
    };

    const sceneObjects = createRoomSceneObjects(room, [door], door.id);
    const wallObjects = sceneObjects.filter((object) => object.userData.wallSegmentId);
    const doorWall = wallObjects.find((object) => object.userData.wallSegmentId === 'point-3-point-0');
    const leafMesh = doorWall?.children
      .find((child) => child.userData.doorLeafFor === door.id)
      ?.children.find((child) => child.userData.isDoorLeaf) as THREE.Mesh | undefined;
    const geometry = leafMesh?.geometry as THREE.BoxGeometry | undefined;

    expect(geometry?.parameters.depth).toBeCloseTo(0.07, 3);
  });

  it('matches 2D swing semantics for left hinge front swing in 3D', () => {
    const room = createRectRoom(720, 480) as Room;
    const door: PlacedFurniture = {
      id: 'door-1',
      templateId: 'door',
      label: '방문',
      color: '#ffffff',
      kind: 'door',
      threeModel: 'box',
      objectHeight: 210,
      elevation: 0,
      width: 90,
      height: 7,
      rotation: 0,
      x: 0,
      y: 120,
      isWallAttached: true,
      wallSegmentId: 'point-0-point-1',
      doorHinge: 'left',
      doorSwingDir: 'front',
      doorOpenAngle: 90,
    };

    const sceneObjects = createRoomSceneObjects(room, [door], door.id);
    const doorWall = sceneObjects
      .filter((object) => object.userData.wallSegmentId)
      .find((object) => object.userData.wallSegmentId === 'point-0-point-1');
    const pivot = doorWall?.children.find((child) => child.userData.doorLeafFor === door.id) as THREE.Group | undefined;
    const leafMesh = pivot?.children.find((child) => child.userData.isDoorLeaf) as THREE.Mesh | undefined;

    expect(pivot?.rotation.y).toBeCloseTo(Math.PI / 2, 3);
    expect(leafMesh?.position.z).toBeLessThan(0);
  });
});
