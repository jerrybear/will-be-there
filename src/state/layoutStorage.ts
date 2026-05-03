import type { SavedLayout } from '../types/layout';

const STORAGE_KEY = 'virtual-room-layout:saved-layouts';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isSavedLayout(value: unknown): value is SavedLayout {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const draft = value as Partial<SavedLayout>;
  return (
    typeof draft.id === 'string' &&
    typeof draft.name === 'string' &&
    typeof draft.updatedAt === 'string' &&
    !!draft.room &&
    typeof draft.room.width === 'number' &&
    typeof draft.room.height === 'number' &&
    Array.isArray(draft.items)
  );
}

export function loadSavedLayouts(): SavedLayout[] {
  if (!canUseStorage()) {
    return [];
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    const filtered = parsedValue.filter(isSavedLayout);
    return filtered.map((layout) => ({
      ...layout,
      memo: layout.memo ?? '',
    }));
  } catch {
    return [];
  }
}

export function persistSavedLayouts(layouts: SavedLayout[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
}
