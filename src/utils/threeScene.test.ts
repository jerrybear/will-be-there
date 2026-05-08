import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createRectRoom } from './geometry';
import { createRoomSceneObjects } from './threeScene';
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
});
