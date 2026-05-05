import { furnitureCatalog } from '../data/furnitureCatalog';
import type { LayoutElementKind, PlacedFurniture, Room, SavedLayout, SavedRoom } from '../types/layout';
import { createRectRoomShape, normalizeRoomShapePointIds } from '../utils/geometry';

const LAYOUT_STORAGE_KEY = 'virtual-room-layout:saved-layouts';
const ROOM_STORAGE_KEY = 'virtual-room-layout:saved-rooms';
export const CURRENT_SCHEMA_VERSION = 5;

interface StoredLayoutsPayload {
  schemaVersion: number;
  layouts: LegacySavedLayout[];
}

interface StoredRoomsPayload {
  schemaVersion: number;
  rooms: SavedRoom[];
}

interface WorkspaceState {
  rooms: SavedRoom[];
  layouts: SavedLayout[];
}

type LegacySavedLayout = {
  schemaVersion?: number;
  id: string;
  roomId?: string;
  name: string;
  memo?: string;
  room?: Room;
  items: PlacedFurniture[];
  updatedAt: string;
};

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isRoom(value: unknown): value is Room {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const draft = value as Partial<Room>;
  return typeof draft.width === 'number' && typeof draft.height === 'number';
}

function isSavedRoom(value: unknown): value is SavedRoom {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const draft = value as Partial<SavedRoom>;
  return (
    (draft.schemaVersion === undefined || typeof draft.schemaVersion === 'number') &&
    typeof draft.id === 'string' &&
    typeof draft.name === 'string' &&
    typeof draft.updatedAt === 'string' &&
    isRoom(draft.room)
  );
}

function isLegacySavedLayout(value: unknown): value is LegacySavedLayout {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const draft = value as Partial<LegacySavedLayout>;
  return (
    (draft.schemaVersion === undefined || typeof draft.schemaVersion === 'number') &&
    typeof draft.id === 'string' &&
    typeof draft.name === 'string' &&
    typeof draft.updatedAt === 'string' &&
    Array.isArray(draft.items) &&
    (typeof draft.roomId === 'string' || isRoom(draft.room))
  );
}

function isStoredLayoutsPayload(value: unknown): value is StoredLayoutsPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const draft = value as Partial<StoredLayoutsPayload>;
  return typeof draft.schemaVersion === 'number' && Array.isArray(draft.layouts);
}

function isStoredRoomsPayload(value: unknown): value is StoredRoomsPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const draft = value as Partial<StoredRoomsPayload>;
  return typeof draft.schemaVersion === 'number' && Array.isArray(draft.rooms);
}

function inferElementKind(item: Partial<PlacedFurniture>): LayoutElementKind {
  if (item.kind) {
    return item.kind;
  }

  if (item.templateId === 'door') {
    return 'door';
  }

  if (item.templateId === 'window') {
    return 'window';
  }

  return 'furniture';
}

function getCatalogDefaults(item: Partial<PlacedFurniture>) {
  return furnitureCatalog.find((template) => template.id === item.templateId);
}

function migratePlacedFurniture(item: PlacedFurniture): PlacedFurniture {
  const catalogDefaults = getCatalogDefaults(item);
  const kind = inferElementKind(item);

  return {
    ...item,
    kind,
    objectHeight: item.objectHeight ?? catalogDefaults?.objectHeight ?? (kind === 'door' ? 210 : kind === 'window' ? 100 : 70),
    elevation: item.elevation ?? catalogDefaults?.elevation ?? 0,
    isWallAttached: item.isWallAttached ?? (kind === 'door' || kind === 'window'),
    wallSegmentId: item.wallSegmentId,
    wallRotationOffset: item.wallRotationOffset ?? 0,
    doorHinge: item.doorHinge,
    doorSwingDir: item.doorSwingDir,
    showDoorSwing: item.showDoorSwing ?? false,
  };
}

function migrateRoom(room: Room): Room {
  if (room.shape?.type === 'polygon' && Array.isArray(room.shape.points)) {
    return {
      ...room,
      shape: normalizeRoomShapePointIds({
        ...room.shape,
        obstacles: Array.isArray(room.shape.obstacles) ? room.shape.obstacles : [],
      }),
    };
  }

  return {
    ...room,
    shape: normalizeRoomShapePointIds(createRectRoomShape(room.width, room.height)),
  };
}

function createRoomId(layout: LegacySavedLayout) {
  return `room-${layout.id}`;
}

function migrateSavedRoom(room: SavedRoom): SavedRoom {
  return {
    ...room,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    memo: room.memo ?? '',
    room: migrateRoom(room.room),
  };
}

function migrateSavedLayout(layout: LegacySavedLayout, fallbackRoomId: string): SavedLayout {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: layout.id,
    roomId: layout.roomId ?? fallbackRoomId,
    name: layout.name,
    memo: layout.memo ?? '',
    items: layout.items.map(migratePlacedFurniture),
    updatedAt: layout.updatedAt,
  };
}

function readJson(rawValue: string | null): unknown {
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

export function parseSavedRoomsPayload(rawValue: string): SavedRoom[] {
  const parsedValue = readJson(rawValue);

  if (isStoredRoomsPayload(parsedValue)) {
    return parsedValue.rooms.filter(isSavedRoom).map(migrateSavedRoom);
  }

  if (Array.isArray(parsedValue)) {
    return parsedValue.filter(isSavedRoom).map(migrateSavedRoom);
  }

  return [];
}

export function parseSavedLayoutsPayload(rawValue: string, knownRooms: SavedRoom[] = []): WorkspaceState {
  const parsedValue = readJson(rawValue);
  const legacyLayouts = isStoredLayoutsPayload(parsedValue)
    ? parsedValue.layouts.filter(isLegacySavedLayout)
    : Array.isArray(parsedValue)
      ? parsedValue.filter(isLegacySavedLayout)
      : [];
  const roomsById = new Map(knownRooms.map((room) => [room.id, migrateSavedRoom(room)]));
  const layouts = legacyLayouts.map((layout) => {
    const fallbackRoomId = layout.roomId ?? createRoomId(layout);

    if (!layout.roomId && layout.room) {
      roomsById.set(fallbackRoomId, {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: fallbackRoomId,
        name: `${layout.name} 방`,
        memo: layout.memo ?? '',
        room: migrateRoom(layout.room),
        updatedAt: layout.updatedAt,
      });
    }

    return migrateSavedLayout(layout, fallbackRoomId);
  });

  return {
    rooms: [...roomsById.values()],
    layouts,
  };
}

export function createStoredRoomsPayload(rooms: SavedRoom[]): StoredRoomsPayload {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    rooms: rooms.map(migrateSavedRoom),
  };
}

export function createStoredLayoutsPayload(layouts: SavedLayout[]): StoredLayoutsPayload {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    layouts: layouts.map((layout) => migrateSavedLayout(layout, layout.roomId)),
  };
}

export function loadWorkspaceState(): WorkspaceState {
  if (!canUseStorage()) {
    return {
      rooms: [],
      layouts: [],
    };
  }

  const rooms = parseSavedRoomsPayload(window.localStorage.getItem(ROOM_STORAGE_KEY) ?? '[]');
  return parseSavedLayoutsPayload(window.localStorage.getItem(LAYOUT_STORAGE_KEY) ?? '[]', rooms);
}

export function persistSavedRooms(rooms: SavedRoom[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify(createStoredRoomsPayload(rooms)));
}

export function persistSavedLayouts(layouts: SavedLayout[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(createStoredLayoutsPayload(layouts)));
}
