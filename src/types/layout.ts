export type Rotation = 0 | 90;
export type SnapSize = 0 | 10 | 24;

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
  isWallAttached?: boolean;
}

export interface PlacedFurniture extends Size, Position {
  id: string;
  templateId: string;
  label: string;
  color: string;
  rotation: Rotation;
  isWallAttached?: boolean;
}

export interface FurnitureGeometryUpdate extends Partial<Size>, Partial<Position> {}

export interface SavedLayout {
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
