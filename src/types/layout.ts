export type Rotation = number;
export type SnapSize = 0 | 10 | 24;
export type LayoutElementKind = 'furniture' | 'door' | 'window';
export type ViewMode = '2d' | '3d';
export type RoomShapePreset = 'rect' | 'l-shape' | 'bay' | 'diagonal';
export type FurnitureCategory = 'doors' | 'windows' | 'seating' | 'tables' | 'storage';

export interface Size {
  width: number;
  height: number;
}

export interface Position {
  id?: string;
  x: number;
  y: number;
}

export interface PolygonRoomShape {
  type: 'polygon';
  points: Position[];
  obstacles: RoomObstacle[];
}

export type RoomShape = PolygonRoomShape;

export type RoomObstacle =
  | (Size & Position & {
      id: string;
      type: 'rect';
      label: string;
    })
  | {
      id: string;
      type: 'polygon';
      label: string;
      points: Position[];
    };

export interface Room extends Size {
  shape: RoomShape;
}

export interface FurnitureTemplate extends Size {
  id: string;
  label: string;
  category: FurnitureCategory;
  color: string;
  kind: LayoutElementKind;
  objectHeight: number;
  elevation?: number;
  isWallAttached?: boolean;
}

export interface PlacedFurniture extends Size, Position {
  id: string;
  templateId: string;
  label: string;
  color: string;
  kind: LayoutElementKind;
  objectHeight: number;
  elevation: number;
  rotation: Rotation;
  wallSegmentId?: string;
  wallRotationOffset?: 0 | 90;
  isWallAttached?: boolean;
  doorHinge?: 'left' | 'right';
  doorSwingDir?: 'front' | 'back';
  showDoorSwing?: boolean;
}

export interface FurnitureGeometryUpdate extends Partial<Size>, Partial<Position> {
  objectHeight?: number;
  elevation?: number;
  color?: string;
}

export interface SavedRoom {
  schemaVersion: number;
  id: string;
  name: string;
  memo: string;
  room: Room;
  updatedAt: string;
}

export interface SavedLayout {
  schemaVersion: number;
  id: string;
  roomId: string;
  name: string;
  memo: string;
  items: PlacedFurniture[];
  updatedAt: string;
}

export function getRotatedSize(item: Pick<PlacedFurniture, 'width' | 'height' | 'rotation'>): Size {
  const normalizedRotation = ((item.rotation % 360) + 360) % 360;

  if (normalizedRotation === 90 || normalizedRotation === 270) {
    return { width: item.height, height: item.width };
  }

  if (normalizedRotation !== 0 && normalizedRotation !== 180) {
    const radians = normalizedRotation * Math.PI / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));

    return {
      width: item.width * cos + item.height * sin,
      height: item.width * sin + item.height * cos,
    };
  }

  return { width: item.width, height: item.height };
}
