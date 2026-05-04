export type Rotation = 0 | 90;
export type SnapSize = 0 | 10 | 24;
export type LayoutElementKind = 'furniture' | 'door' | 'window';
export type ViewMode = '2d' | '3d';

export interface Size {
  width: number;
  height: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface Room extends Size {}

export interface FurnitureTemplate extends Size {
  id: string;
  label: string;
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
  isWallAttached?: boolean;
  doorHinge?: 'left' | 'right';
  doorSwingDir?: 'front' | 'back';
  showDoorSwing?: boolean;
}

export interface FurnitureGeometryUpdate extends Partial<Size>, Partial<Position> {}

export interface SavedLayout {
  schemaVersion: number;
  id: string;
  name: string;
  memo: string;
  room: Room;
  items: PlacedFurniture[];
  updatedAt: string;
}

export function getRotatedSize(item: Pick<PlacedFurniture, 'width' | 'height' | 'rotation'>): Size {
  if (item.rotation === 90) {
    return { width: item.height, height: item.width };
  }

  return { width: item.width, height: item.height };
}
