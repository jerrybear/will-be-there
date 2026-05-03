import { useMemo, useState } from 'react';
import { furnitureCatalog } from '../data/furnitureCatalog';
import type { FurnitureGeometryUpdate, PlacedFurniture, Room, Rotation, SavedLayout, SnapSize } from '../types/layout';
import { getRotatedSize } from '../types/layout';
import { loadSavedLayouts, persistSavedLayouts } from './layoutStorage';

const DEFAULT_ROOM: Room = {
  width: 720,
  height: 480,
};

const MIN_ROOM_WIDTH = 240;
const MIN_ROOM_HEIGHT = 180;
const MAX_ROOM_WIDTH = 1200;
const MAX_ROOM_HEIGHT = 900;
const MIN_FURNITURE_SIZE = 20;
const MAX_HISTORY_LENGTH = 80;

interface LayoutHistorySnapshot {
  room: Room;
  items: PlacedFurniture[];
  selectedId: string | null;
  currentLayoutId: string | null;
}

let nextFurnitureId = 1;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function snapValue(value: number, snapSize: SnapSize) {
  if (snapSize === 0) {
    return value;
  }

  return Math.round(value / snapSize) * snapSize;
}

function clampPosition(roomValue: Room, item: Pick<PlacedFurniture, 'width' | 'height' | 'rotation' | 'isWallAttached'>, x: number, y: number) {
  const footprint = getRotatedSize(item);
  const maxX = Math.max(0, roomValue.width - footprint.width);
  const maxY = Math.max(0, roomValue.height - footprint.height);

  let clampedX = clamp(x, 0, maxX);
  let clampedY = clamp(y, 0, maxY);

  if (item.isWallAttached) {
    const distLeft = clampedX;
    const distRight = maxX - clampedX;
    const distTop = clampedY;
    const distBottom = maxY - clampedY;

    const minDist = Math.min(distLeft, distRight, distTop, distBottom);

    if (minDist === distLeft) {
      clampedX = 0;
    } else if (minDist === distRight) {
      clampedX = maxX;
    } else if (minDist === distTop) {
      clampedY = 0;
    } else if (minDist === distBottom) {
      clampedY = maxY;
    }
  }

  return {
    x: clampedX,
    y: clampedY,
  };
}

function normalizeFurnitureSize(value: number, maxValue: number) {
  return clamp(Math.round(value), MIN_FURNITURE_SIZE, maxValue);
}

function applyFurnitureGeometry(
  roomValue: Room,
  item: PlacedFurniture,
  update: FurnitureGeometryUpdate,
  snapSize: SnapSize,
): PlacedFurniture {
  const maxWidth = item.rotation === 90 ? roomValue.height : roomValue.width;
  const maxHeight = item.rotation === 90 ? roomValue.width : roomValue.height;
  const nextWidth = update.width === undefined ? item.width : normalizeFurnitureSize(snapValue(update.width, snapSize), maxWidth);
  const nextHeight = update.height === undefined ? item.height : normalizeFurnitureSize(snapValue(update.height, snapSize), maxHeight);
  const nextX = update.x === undefined ? item.x : snapValue(update.x, snapSize);
  const nextY = update.y === undefined ? item.y : snapValue(update.y, snapSize);
  const nextItem = {
    ...item,
    width: nextWidth,
    height: nextHeight,
  };
  const position = clampPosition(roomValue, nextItem, nextX, nextY);

  return {
    ...nextItem,
    ...position,
  };
}

function normalizeRoomSize(width: number, height: number): Room {
  return {
    width: clamp(Math.round(width), MIN_ROOM_WIDTH, MAX_ROOM_WIDTH),
    height: clamp(Math.round(height), MIN_ROOM_HEIGHT, MAX_ROOM_HEIGHT),
  };
}

function clampItemsToRoom(roomValue: Room, itemsValue: PlacedFurniture[]) {
  return itemsValue.map((item) => ({
    ...item,
    ...clampPosition(roomValue, item, item.x, item.y),
  }));
}

function createFurnitureId() {
  const id = nextFurnitureId;
  nextFurnitureId += 1;
  return `furniture-${id}`;
}

function createSavedLayoutId() {
  return `layout-${Date.now()}`;
}

function getNextFurnitureId(itemsValue: PlacedFurniture[]) {
  const maxId = itemsValue.reduce((maxValue, item) => {
    const match = item.id.match(/^furniture-(\d+)$/);

    if (!match) {
      return maxValue;
    }

    return Math.max(maxValue, Number(match[1]));
  }, 0);

  return maxId + 1;
}

export function useRoomLayout() {
  const [room, setRoom] = useState<Room>(DEFAULT_ROOM);
  const [items, setItems] = useState<PlacedFurniture[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapSize, setSnapSize] = useState<SnapSize>(0);
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>(() => loadSavedLayouts());
  const [currentLayoutId, setCurrentLayoutId] = useState<string | null>(null);
  const [pastLayouts, setPastLayouts] = useState<LayoutHistorySnapshot[]>([]);
  const [futureLayouts, setFutureLayouts] = useState<LayoutHistorySnapshot[]>([]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const createLayoutSnapshot = (): LayoutHistorySnapshot => ({
    room,
    items,
    selectedId,
    currentLayoutId,
  });

  const restoreLayoutSnapshot = (snapshot: LayoutHistorySnapshot) => {
    nextFurnitureId = getNextFurnitureId(snapshot.items);
    setRoom(snapshot.room);
    setItems(snapshot.items);
    setSelectedId(snapshot.selectedId);
    setCurrentLayoutId(snapshot.currentLayoutId);
  };

  const recordHistory = () => {
    const snapshot = createLayoutSnapshot();
    setPastLayouts((currentPastLayouts) => [...currentPastLayouts.slice(-(MAX_HISTORY_LENGTH - 1)), snapshot]);
    setFutureLayouts([]);
  };

  const undoLayoutChange = () => {
    setPastLayouts((currentPastLayouts) => {
      const previousSnapshot = currentPastLayouts[currentPastLayouts.length - 1];

      if (!previousSnapshot) {
        return currentPastLayouts;
      }

      setFutureLayouts((currentFutureLayouts) => [createLayoutSnapshot(), ...currentFutureLayouts.slice(0, MAX_HISTORY_LENGTH - 1)]);
      restoreLayoutSnapshot(previousSnapshot);
      return currentPastLayouts.slice(0, -1);
    });
  };

  const redoLayoutChange = () => {
    setFutureLayouts((currentFutureLayouts) => {
      const nextSnapshot = currentFutureLayouts[0];

      if (!nextSnapshot) {
        return currentFutureLayouts;
      }

      setPastLayouts((currentPastLayouts) => [...currentPastLayouts.slice(-(MAX_HISTORY_LENGTH - 1)), createLayoutSnapshot()]);
      restoreLayoutSnapshot(nextSnapshot);
      return currentFutureLayouts.slice(1);
    });
  };

  const addFurniture = (templateId: string) => {
    const template = furnitureCatalog.find((item) => item.id === templateId);

    if (!template) {
      return;
    }

    recordHistory();

    const offset = items.length % 6;
    const draftItem: PlacedFurniture = {
      id: createFurnitureId(),
      templateId: template.id,
      label: template.label,
      color: template.color,
      width: template.width,
      height: template.height,
      rotation: 0,
      isWallAttached: template.isWallAttached,
      x: 24 + offset * 28,
      y: 24 + offset * 28,
    };

    const nextItem = applyFurnitureGeometry(room, draftItem, { x: draftItem.x, y: draftItem.y }, snapSize);

    setItems((currentItems) => [...currentItems, nextItem]);
    setSelectedId(nextItem.id);
  };

  const selectFurniture = (id: string | null) => {
    setSelectedId(id);
  };

  const beginFurnitureMove = () => {
    recordHistory();
  };

  const moveFurniture = (id: string, x: number, y: number) => {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== id) {
          return item;
        }

        return applyFurnitureGeometry(room, item, { x, y }, snapSize);
      }),
    );
  };

  const updateFurnitureGeometry = (id: string, update: FurnitureGeometryUpdate) => {
    recordHistory();

    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== id) {
          return item;
        }

        return applyFurnitureGeometry(room, item, update, snapSize);
      }),
    );
  };

  const rotateFurniture = (id: string) => {
    recordHistory();

    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== id) {
          return item;
        }

        const nextRotation: Rotation = item.rotation === 0 ? 90 : 0;
        const nextItem = { ...item, rotation: nextRotation };
        const position = clampPosition(room, nextItem, item.x, item.y);

        return {
          ...nextItem,
          ...position,
        };
      }),
    );
  };

  const duplicateFurniture = (id: string) => {
    const item = items.find((currentItem) => currentItem.id === id);

    if (!item) {
      return;
    }

    recordHistory();

    const draftItem: PlacedFurniture = {
      ...item,
      id: createFurnitureId(),
      x: item.x + 28,
      y: item.y + 28,
    };
    const nextItem = applyFurnitureGeometry(room, draftItem, { x: draftItem.x, y: draftItem.y }, snapSize);

    setItems((currentItems) => [...currentItems, nextItem]);
    setSelectedId(nextItem.id);
  };

  const deleteFurniture = (id: string) => {
    recordHistory();

    setItems((currentItems) => currentItems.filter((item) => item.id !== id));
    setSelectedId((currentSelectedId) => (currentSelectedId === id ? null : currentSelectedId));
  };

  const resetLayout = () => {
    recordHistory();

    setRoom(DEFAULT_ROOM);
    setItems([]);
    setSelectedId(null);
    setCurrentLayoutId(null);
  };

  const resizeRoom = (width: number, height: number) => {
    const nextRoom = normalizeRoomSize(width, height);
    recordHistory();

    setRoom(nextRoom);
    setItems((currentItems) => clampItemsToRoom(nextRoom, currentItems));
  };

  const saveLayout = (name: string, memo: string = '') => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    const now = new Date().toISOString();
    const nextLayout: SavedLayout = {
      id: createSavedLayoutId(),
      name: trimmedName,
      memo: memo.trim(),
      room,
      items,
      updatedAt: now,
    };

    setSavedLayouts((currentLayouts) => {
      const nextLayouts = [nextLayout, ...currentLayouts];
      persistSavedLayouts(nextLayouts);
      return nextLayouts;
    });
    setCurrentLayoutId(nextLayout.id);
  };

  const loadLayout = (id: string) => {
    const layout = savedLayouts.find((savedLayout) => savedLayout.id === id);

    if (!layout) {
      return;
    }

    recordHistory();

    nextFurnitureId = getNextFurnitureId(layout.items);
    setRoom(layout.room);
    setItems(clampItemsToRoom(layout.room, layout.items));
    setSelectedId(null);
    setCurrentLayoutId(layout.id);
  };

  const deleteLayout = (id: string) => {
    setSavedLayouts((currentLayouts) => {
      const nextLayouts = currentLayouts.filter((layout) => layout.id !== id);
      persistSavedLayouts(nextLayouts);
      return nextLayouts;
    });
    if (id === currentLayoutId) {
      setCurrentLayoutId(null);
    }
  };

  const updateCurrentLayout = () => {
    if (!currentLayoutId) return;

    setSavedLayouts((currentLayouts) => {
      const nextLayouts = currentLayouts.map((layout) => {
        if (layout.id !== currentLayoutId) {
          return layout;
        }
        return {
          ...layout,
          room,
          items,
          updatedAt: new Date().toISOString(),
        };
      });
      persistSavedLayouts(nextLayouts);
      return nextLayouts;
    });
  };

  const updateLayoutMeta = (id: string, name: string, memo: string) => {
    setSavedLayouts((currentLayouts) => {
      const nextLayouts = currentLayouts.map((layout) => {
        if (layout.id !== id) {
          return layout;
        }
        return {
          ...layout,
          name: name.trim() || layout.name, // fallback to old name if empty
          memo: memo.trim(),
          updatedAt: new Date().toISOString(), // Update timestamp on edit
        };
      });
      persistSavedLayouts(nextLayouts);
      return nextLayouts;
    });
  };

  return {
    room,
    catalog: furnitureCatalog,
    items,
    selectedId,
    selectedItem,
    snapSize,
    savedLayouts,
    canUndo: pastLayouts.length > 0,
    canRedo: futureLayouts.length > 0,
    addFurniture,
    selectFurniture,
    beginFurnitureMove,
    moveFurniture,
    updateFurnitureGeometry,
    rotateFurniture,
    duplicateFurniture,
    deleteFurniture,
    setSnapSize,
    resetLayout,
    resizeRoom,
    saveLayout,
    loadLayout,
    deleteLayout,
    updateLayoutMeta,
    currentLayoutId,
    updateCurrentLayout,
    undoLayoutChange,
    redoLayoutChange,
  };
}
