import { furnitureCatalog } from '../data/furnitureCatalog';
import type { LayoutElementKind, PlacedFurniture, SavedLayout } from '../types/layout';

const STORAGE_KEY = 'virtual-room-layout:saved-layouts';
export const CURRENT_SCHEMA_VERSION = 3;

interface StoredLayoutsV2 {
  schemaVersion: number;
  layouts: SavedLayout[];
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isSavedLayout(value: unknown): value is SavedLayout {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const draft = value as Partial<SavedLayout>;
  return (
    (draft.schemaVersion === undefined || typeof draft.schemaVersion === 'number') &&
    typeof draft.id === 'string' &&
    typeof draft.name === 'string' &&
    typeof draft.updatedAt === 'string' &&
    !!draft.room &&
    typeof draft.room.width === 'number' &&
    typeof draft.room.height === 'number' &&
    Array.isArray(draft.items)
  );
}

function isStoredLayoutsV2(value: unknown): value is StoredLayoutsV2 {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const draft = value as Partial<StoredLayoutsV2>;
  return typeof draft.schemaVersion === 'number' && Array.isArray(draft.layouts);
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
    doorHinge: item.doorHinge,
    doorSwingDir: item.doorSwingDir,
    showDoorSwing: item.showDoorSwing ?? false,
  };
}

function migrateSavedLayout(layout: SavedLayout): SavedLayout {
  return {
    ...layout,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    memo: layout.memo ?? '',
    items: layout.items.map(migratePlacedFurniture),
  };
}

export function parseSavedLayoutsPayload(rawValue: string): SavedLayout[] {
  try {
    const parsedValue: unknown = JSON.parse(rawValue);

    if (isStoredLayoutsV2(parsedValue)) {
      return parsedValue.layouts.filter(isSavedLayout).map(migrateSavedLayout);
    }

    if (Array.isArray(parsedValue)) {
      return parsedValue.filter(isSavedLayout).map(migrateSavedLayout);
    }

    return [];
  } catch {
    return [];
  }
}

export function createStoredLayoutsPayload(layouts: SavedLayout[]): StoredLayoutsV2 {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    layouts: layouts.map(migrateSavedLayout),
  };
}

export function loadSavedLayouts(): SavedLayout[] {
  if (!canUseStorage()) {
    return [];
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  return parseSavedLayoutsPayload(rawValue);
}

export function persistSavedLayouts(layouts: SavedLayout[]) {
  if (!canUseStorage()) {
    return;
  }

  const nextValue = createStoredLayoutsPayload(layouts);

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextValue));
}
