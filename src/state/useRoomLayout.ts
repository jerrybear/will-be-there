import { useMemo, useState } from 'react';
import { furnitureCatalog } from '../data/furnitureCatalog';
import type { PlacedFurniture, Room, Rotation, SavedLayout } from '../types/layout';
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

let nextFurnitureId = 1;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampPosition(roomValue: Room, item: Pick<PlacedFurniture, 'width' | 'height' | 'rotation'>, x: number, y: number) {
  const footprint = getRotatedSize(item);
  const maxX = Math.max(0, roomValue.width - footprint.width);
  const maxY = Math.max(0, roomValue.height - footprint.height);

  return {
    x: clamp(x, 0, maxX),
    y: clamp(y, 0, maxY),
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
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>(() => loadSavedLayouts());

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const addFurniture = (templateId: string) => {
    const template = furnitureCatalog.find((item) => item.id === templateId);

    if (!template) {
      return;
    }

    const offset = items.length % 6;
    const draftItem: PlacedFurniture = {
      id: createFurnitureId(),
      templateId: template.id,
      label: template.label,
      color: template.color,
      width: template.width,
      height: template.height,
      rotation: 0,
      x: 24 + offset * 28,
      y: 24 + offset * 28,
    };

    const position = clampPosition(room, draftItem, draftItem.x, draftItem.y);
    const nextItem = { ...draftItem, ...position };

    setItems((currentItems) => [...currentItems, nextItem]);
    setSelectedId(nextItem.id);
  };

  const selectFurniture = (id: string | null) => {
    setSelectedId(id);
  };

  const moveFurniture = (id: string, x: number, y: number) => {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== id) {
          return item;
        }

        const position = clampPosition(room, item, x, y);
        return { ...item, ...position };
      }),
    );
  };

  const rotateFurniture = (id: string) => {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== id) {
          return item;
        }

        const nextRotation: Rotation = item.rotation === 0 ? 90 : 0;
        const position = clampPosition(room, { ...item, rotation: nextRotation }, item.x, item.y);

        return {
          ...item,
          rotation: nextRotation,
          ...position,
        };
      }),
    );
  };

  const resetLayout = () => {
    setRoom(DEFAULT_ROOM);
    setItems([]);
    setSelectedId(null);
  };

  const resizeRoom = (width: number, height: number) => {
    const nextRoom = normalizeRoomSize(width, height);
    setRoom(nextRoom);
    setItems((currentItems) => clampItemsToRoom(nextRoom, currentItems));
  };

  const saveLayout = (name: string) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    const now = new Date().toISOString();
    const nextLayout: SavedLayout = {
      id: createSavedLayoutId(),
      name: trimmedName,
      room,
      items,
      updatedAt: now,
    };

    setSavedLayouts((currentLayouts) => {
      const nextLayouts = [nextLayout, ...currentLayouts];
      persistSavedLayouts(nextLayouts);
      return nextLayouts;
    });
  };

  const loadLayout = (id: string) => {
    const layout = savedLayouts.find((savedLayout) => savedLayout.id === id);

    if (!layout) {
      return;
    }

    nextFurnitureId = getNextFurnitureId(layout.items);
    setRoom(layout.room);
    setItems(clampItemsToRoom(layout.room, layout.items));
    setSelectedId(null);
  };

  const deleteLayout = (id: string) => {
    setSavedLayouts((currentLayouts) => {
      const nextLayouts = currentLayouts.filter((layout) => layout.id !== id);
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
    savedLayouts,
    addFurniture,
    selectFurniture,
    moveFurniture,
    rotateFurniture,
    resetLayout,
    resizeRoom,
    saveLayout,
    loadLayout,
    deleteLayout,
  };
}
