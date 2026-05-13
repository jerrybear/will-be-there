export type Rotation = number;
export type SnapSize = 0 | 10 | 24;
export type LayoutElementKind = 'furniture' | 'door' | 'window';
export type ViewMode = '2d' | '3d';
export type RoomShapePreset = 'rect' | 'l-shape' | 'bay' | 'diagonal';
export type FurnitureCategory = 'doors' | 'windows' | 'seating' | 'tables' | 'storage';
export type FurnitureThreeModel =
  | 'box'
  | 'desk_neomin'
  | 'desk_four_leg'
  | 'bed_frame'
  | 'sofa_cushion'
  | 'dresser_wide_3'
  | 'dresser_tall_4'
  | 'dresser_tall_5'
  | 'media_console';
export type CanvasTool = 'select' | 'walls' | 'memo';

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
  wallHeight: number;
  shape: RoomShape;
}

export interface FurnitureTemplate extends Size {
  id: string;
  label: string;
  category: FurnitureCategory;
  color: string;
  kind: LayoutElementKind;
  threeModel: FurnitureThreeModel;
  objectHeight: number;
  elevation?: number;
  isWallAttached?: boolean;
}

export type CustomFurnitureTemplate = FurnitureTemplate;
export type CustomFurnitureTemplateDraft = Omit<CustomFurnitureTemplate, 'id' | 'kind' | 'threeModel' | 'elevation' | 'isWallAttached'>;

export interface PlacedFurniture extends Size, Position {
  id: string;
  templateId: string;
  label: string;
  color: string;
  kind: LayoutElementKind;
  threeModel: FurnitureThreeModel;
  objectHeight: number;
  elevation: number;
  rotation: Rotation;
  wallSegmentId?: string;
  wallRotationOffset?: 0 | 90;
  isWallAttached?: boolean;
  doorHinge?: 'left' | 'right';
  doorSwingDir?: 'front' | 'back';
  showDoorSwing?: boolean;
  doorOpenAngle?: number;
}

export interface LayoutNote extends Position {
  id: string;
  text: string;
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
  notes: LayoutNote[];
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
