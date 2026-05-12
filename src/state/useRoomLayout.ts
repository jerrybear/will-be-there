import { useMemo, useState } from 'react';
import { furnitureCatalog } from '../data/furnitureCatalog';
import type { CustomFurnitureTemplate, CustomFurnitureTemplateDraft, FurnitureGeometryUpdate, FurnitureTemplate, LayoutNote, PlacedFurniture, Room, RoomObstacle, RoomShapePreset, Rotation, SavedLayout, SavedRoom, SnapSize } from '../types/layout';
import { getRotatedSize } from '../types/layout';
import {
  createRectRoom,
  createRoomShapeFromPreset,
  getItemPlacementRect,
  getNearestWallProjection,
  getRoomShape,
  getSegmentAngle,
  hasPolygonSelfIntersection,
  isRectInsideRoom,
  normalizeRotation,
  rectFromItem,
  rectsOverlap,
} from '../utils/geometry';
import { loadCustomFurnitureCatalog, loadWorkspaceState, persistCustomFurnitureCatalog, persistSavedLayouts, persistSavedRooms } from './layoutStorage';

const DEFAULT_ROOM: Room = createRectRoom(7200, 4800);

const MIN_ROOM_WIDTH = 1;
const MIN_ROOM_HEIGHT = 1;
const MAX_ROOM_WIDTH = Number.MAX_SAFE_INTEGER;
const MAX_ROOM_HEIGHT = Number.MAX_SAFE_INTEGER;
const MIN_FURNITURE_SIZE = 20;
const MIN_OBJECT_HEIGHT = 1;
const MAX_OBJECT_HEIGHT = 4000;
const MAX_OBJECT_ELEVATION = 4000;
const MAX_DOOR_OPEN_ANGLE = 120;
const MAX_HISTORY_LENGTH = 80;

interface LayoutHistorySnapshot {
  room: Room;
  items: PlacedFurniture[];
  notes: LayoutNote[];
  selectedId: string | null;
  currentRoomId: string | null;
  currentLayoutId: string | null;
}

let nextFurnitureId = 1;
let nextObstacleId = 1;
let nextNoteId = 1;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function snapValue(value: number, snapSize: SnapSize) {
  if (snapSize === 0) {
    return value;
  }

  return Math.round(value / snapSize) * snapSize;
}

function snapRoomCoordinate(value: number, snapSize: SnapSize, maxValue: number) {
  return clamp(snapValue(Math.round(value), snapSize), 0, maxValue);
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

  if (!isRectInsideRoom(roomValue, getItemPlacementRect(item, clampedX, clampedY))) {
    const fallbackPosition = findNearestValidPosition(roomValue, item, clampedX, clampedY);

    if (fallbackPosition) {
      return fallbackPosition;
    }
  }

  return {
    x: clampedX,
    y: clampedY,
  };
}

function findNearestValidPosition(
  roomValue: Room,
  item: Pick<PlacedFurniture, 'width' | 'height' | 'rotation'>,
  x: number,
  y: number,
) {
  const footprint = getRotatedSize(item);
  const maxX = Math.max(0, roomValue.width - footprint.width);
  const maxY = Math.max(0, roomValue.height - footprint.height);
  const startX = clamp(x, 0, maxX);
  const startY = clamp(y, 0, maxY);
  const searchStep = 10;
  const maxRadius = Math.max(roomValue.width, roomValue.height);

  for (let radius = 0; radius <= maxRadius; radius += searchStep) {
    for (let dx = -radius; dx <= radius; dx += searchStep) {
      for (let dy = -radius; dy <= radius; dy += searchStep) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) {
          continue;
        }

        const candidateX = clamp(startX + dx, 0, maxX);
        const candidateY = clamp(startY + dy, 0, maxY);

        if (isRectInsideRoom(roomValue, getItemPlacementRect(item, candidateX, candidateY))) {
          return {
            x: candidateX,
            y: candidateY,
          };
        }
      }
    }
  }

  return null;
}

function snapPositionToWall(
  roomValue: Room,
  item: Pick<PlacedFurniture, 'width' | 'height' | 'rotation' | 'wallRotationOffset'>,
  x: number,
  y: number,
) {
  const currentFootprint = getRotatedSize(item);
  const centerX = x + currentFootprint.width / 2;
  const centerY = y + currentFootprint.height / 2;
  const projection = getNearestWallProjection(roomValue, { x: centerX, y: centerY });

  if (!projection) {
    return {
      item,
      position: { x, y },
    };
  }

  const wallRotation = normalizeRotation(getSegmentAngle(projection.segment) + (item.wallRotationOffset ?? 0));
  const rotatedItem = {
    ...item,
    rotation: wallRotation,
  };
  const footprint = getRotatedSize(rotatedItem);
  const maxX = Math.max(0, roomValue.width - footprint.width);
  const maxY = Math.max(0, roomValue.height - footprint.height);

  return {
    item: {
      ...rotatedItem,
      wallSegmentId: projection.segment.id,
    },
    position: {
      x: clamp(projection.projection.x - footprint.width / 2, 0, maxX),
      y: clamp(projection.projection.y - footprint.height / 2, 0, maxY),
    },
  };
}

function clampPositionToRoomBounds(
  roomValue: Room,
  item: Pick<PlacedFurniture, 'width' | 'height'>,
  x: number,
  y: number,
) {
  const maxX = Math.max(0, roomValue.width - item.width);
  const maxY = Math.max(0, roomValue.height - item.height);

  return {
    x: clamp(x, 0, maxX),
    y: clamp(y, 0, maxY),
  };
}

function normalizeFurnitureSize(value: number, maxValue: number) {
  return clamp(Math.round(value), MIN_FURNITURE_SIZE, maxValue);
}

function normalizeFurnitureColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#94a3b8';
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
  const nextObjectHeight = update.objectHeight === undefined
    ? item.objectHeight
    : clamp(Math.round(update.objectHeight), MIN_OBJECT_HEIGHT, MAX_OBJECT_HEIGHT);
  const nextElevation = update.elevation === undefined
    ? item.elevation
    : clamp(Math.round(update.elevation), 0, MAX_OBJECT_ELEVATION);
  const nextColor = update.color === undefined ? item.color : normalizeFurnitureColor(update.color);
  const nextX = update.x === undefined ? item.x : snapValue(update.x, snapSize);
  const nextY = update.y === undefined ? item.y : snapValue(update.y, snapSize);
  const nextItem = {
    ...item,
    width: nextWidth,
    height: nextHeight,
    objectHeight: nextObjectHeight,
    elevation: nextElevation,
    color: nextColor,
  };

  if (nextItem.isWallAttached && (update.x !== undefined || update.y !== undefined)) {
    const wallPlacement = snapPositionToWall(roomValue, nextItem, nextX, nextY);

    return {
      ...nextItem,
      ...wallPlacement.item,
      ...wallPlacement.position,
    };
  }

  const position = clampPosition(roomValue, nextItem, nextX, nextY);

  return {
    ...nextItem,
    ...position,
  };
}

function normalizeWallHeight(value: number) {
  return Math.max(MIN_OBJECT_HEIGHT, Math.round(value));
}

function normalizeDoorOpenAngle(value: number) {
  return clamp(Math.round(value), 0, MAX_DOOR_OPEN_ANGLE);
}

function normalizeRoomSize(width: number, height: number, wallHeight: number): Room {
  const nextRoom = createRectRoom(
    clamp(Math.round(width), MIN_ROOM_WIDTH, MAX_ROOM_WIDTH),
    clamp(Math.round(height), MIN_ROOM_HEIGHT, MAX_ROOM_HEIGHT),
  );
  nextRoom.wallHeight = normalizeWallHeight(wallHeight);
  return nextRoom;
}

function clampItemsToRoom(roomValue: Room, itemsValue: PlacedFurniture[]) {
  return itemsValue.map((item) => ({
    ...item,
    ...clampPosition(roomValue, item, item.x, item.y),
  }));
}

function getSwingBounds(item: PlacedFurniture): { x: number, y: number, width: number, height: number } | null {
  if (item.kind !== 'door' || !item.showDoorSwing || !item.doorHinge || !item.doorSwingDir) return null;
  
  const footprint = getRotatedSize(item);
  const R = Math.max(item.width, item.height);
  const isHorizontal = footprint.width > footprint.height;

  let localX = 0;
  let localY = 0;

  if (isHorizontal) {
    if (item.doorSwingDir === 'front') localY = -R;
    else localY = footprint.height;

    if (item.doorHinge === 'left') localX = 0;
    else localX = footprint.width - R;
  } else {
    if (item.doorSwingDir === 'front') localX = -R;
    else localX = footprint.width;

    if (item.doorHinge === 'left') localY = 0;
    else localY = footprint.height - R;
  }

  return {
    x: item.x + localX,
    y: item.y + localY,
    width: R,
    height: R,
  };
}

function createFurnitureId() {
  const id = nextFurnitureId;
  nextFurnitureId += 1;
  return `furniture-${id}`;
}

function createSavedLayoutId() {
  return `layout-${Date.now()}`;
}

function createSavedRoomId() {
  return `room-${Date.now()}`;
}

function createObstacleId() {
  const id = nextObstacleId;
  nextObstacleId += 1;
  return `obstacle-${id}`;
}

function createCustomFurnitureTemplateId() {
  return `custom-furniture-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function createNoteId() {
  const id = nextNoteId;
  nextNoteId += 1;
  return `note-${id}`;
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

function getNextObstacleId(roomValue: Room) {
  const maxId = getRoomShape(roomValue).obstacles.reduce((maxValue, obstacle) => {
    const match = obstacle.id.match(/^obstacle-(\d+)$/);

    if (!match) {
      return maxValue;
    }

    return Math.max(maxValue, Number(match[1]));
  }, 0);

  return maxId + 1;
}

function getNextNoteId(notesValue: LayoutNote[]) {
  const maxId = notesValue.reduce((maxValue, note) => {
    const match = note.id.match(/^note-(\d+)$/);

    if (!match) {
      return maxValue;
    }

    return Math.max(maxValue, Number(match[1]));
  }, 0);

  return maxId + 1;
}

function normalizeLayoutForComparison(roomValue: Room, itemsValue: PlacedFurniture[]) {
  return JSON.stringify({
    room: roomValue,
    items: itemsValue,
  });
}

export function useRoomLayout() {
  const initialWorkspaceState = useMemo(() => loadWorkspaceState(), []);
  const initialCustomFurnitureCatalog = useMemo(() => loadCustomFurnitureCatalog(), []);
  const [room, setRoom] = useState<Room>(DEFAULT_ROOM);
  const [items, setItems] = useState<PlacedFurniture[]>([]);
  const [notes, setNotes] = useState<LayoutNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<PlacedFurniture | null>(null);
  const [snapSize, setSnapSize] = useState<SnapSize>(0);
  const [savedRooms, setSavedRooms] = useState<SavedRoom[]>(() => initialWorkspaceState.rooms);
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>(() => initialWorkspaceState.layouts);
  const [customFurnitureCatalog, setCustomFurnitureCatalog] = useState<CustomFurnitureTemplate[]>(() => initialCustomFurnitureCatalog);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [currentLayoutId, setCurrentLayoutId] = useState<string | null>(null);
  const [pastLayouts, setPastLayouts] = useState<LayoutHistorySnapshot[]>([]);
  const [futureLayouts, setFutureLayouts] = useState<LayoutHistorySnapshot[]>([]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const currentLayout = useMemo(
    () => savedLayouts.find((layout) => layout.id === currentLayoutId) ?? null,
    [currentLayoutId, savedLayouts],
  );

  const currentRoom = useMemo(
    () => savedRooms.find((savedRoom) => savedRoom.id === currentRoomId) ?? null,
    [currentRoomId, savedRooms],
  );

  const catalog = useMemo<FurnitureTemplate[]>(
    () => [...furnitureCatalog, ...customFurnitureCatalog],
    [customFurnitureCatalog],
  );

  const hasUnsavedChanges = useMemo(() => {
    if (!currentLayout) {
      return items.length > 0 || notes.length > 0;
    }

    return (
      JSON.stringify(items) !== JSON.stringify(currentLayout.items) ||
      JSON.stringify(notes) !== JSON.stringify(currentLayout.notes) ||
      currentLayout.roomId !== currentRoomId
    );
  }, [currentLayout, currentRoomId, items, notes]);

  const hasUnsavedRoomChanges = useMemo(() => {
    if (!currentRoom) {
      return normalizeLayoutForComparison(room, []) !== normalizeLayoutForComparison(DEFAULT_ROOM, []);
    }

    return normalizeLayoutForComparison(room, []) !== normalizeLayoutForComparison(currentRoom.room, []);
  }, [currentRoom, room]);

  const overlappingItemIds = useMemo(() => {
    const ids = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];

        if (a.isWallAttached && b.isWallAttached) continue;

        const boundsA = rectFromItem(a);
        const boundsB = rectFromItem(b);

        const overlap = rectsOverlap(boundsA, boundsB);
        let swingOverlap = false;

        if (!overlap) {
          const swingA = getSwingBounds(a);
          if (swingA && rectsOverlap(swingA, boundsB)) swingOverlap = true;
          
          const swingB = getSwingBounds(b);
          if (swingB && rectsOverlap(swingB, boundsA)) swingOverlap = true;
        }

        if (overlap || swingOverlap) {
          ids.add(a.id);
          ids.add(b.id);
        }
      }
    }
    return ids;
  }, [items]);

  const isSelfIntersecting = useMemo(() => {
    return hasPolygonSelfIntersection(getRoomShape(room).points);
  }, [room]);

  const createLayoutSnapshot = (): LayoutHistorySnapshot => ({
    room,
    items,
    notes,
    selectedId,
    currentRoomId,
    currentLayoutId,
  });

  const restoreLayoutSnapshot = (snapshot: LayoutHistorySnapshot) => {
    nextFurnitureId = getNextFurnitureId(snapshot.items);
    nextObstacleId = getNextObstacleId(snapshot.room);
    nextNoteId = getNextNoteId(snapshot.notes);
    setRoom(snapshot.room);
    setItems(snapshot.items);
    setNotes(snapshot.notes);
    setSelectedId(snapshot.selectedId);
    setCurrentRoomId(snapshot.currentRoomId);
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
    const template = catalog.find((item) => item.id === templateId);

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
      kind: template.kind,
      threeModel: template.threeModel,
      objectHeight: template.objectHeight,
      elevation: template.elevation ?? 0,
      width: template.width,
      height: template.height,
      rotation: 0,
      isWallAttached: template.isWallAttached,
      doorHinge: template.kind === 'door' ? 'left' : undefined,
      doorSwingDir: template.kind === 'door' ? 'front' : undefined,
      showDoorSwing: template.kind === 'door' ? false : undefined,
      doorOpenAngle: template.kind === 'door' ? 90 : undefined,
      x: 24 + offset * 28,
      y: 24 + offset * 28,
    };

    const nextItem = applyFurnitureGeometry(room, draftItem, { x: draftItem.x, y: draftItem.y }, snapSize);

    setItems((currentItems) => [...currentItems, nextItem]);
    setSelectedId(nextItem.id);
  };

  const addCustomFurnitureTemplate = (template: CustomFurnitureTemplateDraft) => {
    const trimmedLabel = template.label.trim();

    if (!trimmedLabel) {
      return null;
    }

    const nextTemplate: CustomFurnitureTemplate = {
      id: createCustomFurnitureTemplateId(),
      label: trimmedLabel,
      category: template.category,
      width: normalizeFurnitureSize(template.width, MAX_ROOM_WIDTH),
      height: normalizeFurnitureSize(template.height, MAX_ROOM_HEIGHT),
      objectHeight: clamp(Math.round(template.objectHeight), MIN_OBJECT_HEIGHT, MAX_OBJECT_HEIGHT),
      color: normalizeFurnitureColor(template.color),
      kind: 'furniture',
      threeModel: 'box',
      elevation: 0,
      isWallAttached: false,
    };

    setCustomFurnitureCatalog((currentTemplates) => {
      const nextTemplates = [...currentTemplates, nextTemplate];
      persistCustomFurnitureCatalog(nextTemplates);
      return nextTemplates;
    });

    return nextTemplate.id;
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

  const renameFurniture = (id: string, label: string) => {
    const trimmedLabel = label.trim();

    if (!trimmedLabel) {
      return;
    }

    recordHistory();
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== id) {
          return item;
        }

        return {
          ...item,
          label: trimmedLabel,
        };
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

        const wallRotationOffset = item.isWallAttached ? (item.wallRotationOffset === 90 ? 0 : 90) : item.wallRotationOffset;
        const nextRotation: Rotation = item.isWallAttached ? normalizeRotation(item.rotation + 90) : item.rotation === 0 ? 90 : 0;
        const nextItem = { ...item, rotation: nextRotation, wallRotationOffset };

        return applyFurnitureGeometry(room, nextItem, { x: item.x, y: item.y }, snapSize);
      }),
    );
  };

  const updateDoorSwing = (id: string, updates: Partial<Pick<PlacedFurniture, 'doorHinge' | 'doorSwingDir' | 'showDoorSwing' | 'doorOpenAngle'>>) => {
    recordHistory();
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          ...updates,
          doorOpenAngle: updates.doorOpenAngle === undefined
            ? item.doorOpenAngle
            : normalizeDoorOpenAngle(updates.doorOpenAngle),
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

  const copyFurniture = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (item) {
      setClipboard(item);
    }
  };

  const pasteFurniture = () => {
    if (!clipboard) return;

    recordHistory();
    const newItem: PlacedFurniture = {
      ...clipboard,
      id: createFurnitureId(),
      x: clipboard.x + 28,
      y: clipboard.y + 28,
    };
    
    const finalizedItem = applyFurnitureGeometry(room, newItem, { x: newItem.x, y: newItem.y }, snapSize);
    setItems((current) => [...current, finalizedItem]);
    setSelectedId(finalizedItem.id);
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
    setNotes([]);
    setSelectedId(null);
    setCurrentRoomId(null);
    setCurrentLayoutId(null);
  };

  const resizeRoom = (width: number, height: number, wallHeight: number = room.wallHeight) => {
    const resizedRoom = normalizeRoomSize(width, height, wallHeight);
    const currentShape = getRoomShape(room);
    const nextRoom = {
      ...resizedRoom,
      shape: {
        ...resizedRoom.shape,
        obstacles: currentShape.obstacles,
      },
    };
    recordHistory();

    setRoom(nextRoom);
    setItems((currentItems) => clampItemsToRoom(nextRoom, currentItems));
    setNotes((currentNotes) =>
      currentNotes.map((note) => ({
        ...note,
        x: clamp(note.x, 0, nextRoom.width),
        y: clamp(note.y, 0, nextRoom.height),
      })),
    );
  };

  const applyRoomShapePreset = (preset: RoomShapePreset) => {
    recordHistory();

    const currentShape = getRoomShape(room);
    const nextRoom: Room = {
      ...room,
      shape: createRoomShapeFromPreset(room.width, room.height, preset, currentShape.obstacles),
    };

    setRoom(nextRoom);
    setItems((currentItems) => clampItemsToRoom(nextRoom, currentItems));
    setNotes((currentNotes) =>
      currentNotes.map((note) => ({
        ...note,
        x: clamp(note.x, 0, nextRoom.width),
        y: clamp(note.y, 0, nextRoom.height),
      })),
    );
  };

  const applyRoomJson = (nextRoom: Room) => {
    recordHistory();
    nextObstacleId = getNextObstacleId(nextRoom);
    setRoom(nextRoom);
    setItems((currentItems) => clampItemsToRoom(nextRoom, currentItems));
    setNotes((currentNotes) =>
      currentNotes.map((note) => ({
        ...note,
        x: clamp(note.x, 0, nextRoom.width),
        y: clamp(note.y, 0, nextRoom.height),
      })),
    );
  };

  const beginRoomShapeEdit = () => {
    recordHistory();
  };

  const moveRoomPoint = (index: number, x: number, y: number) => {
    const nextRoom: Room = {
      ...room,
      shape: {
        ...getRoomShape(room),
        points: getRoomShape(room).points.map((point, pointIndex) => {
          if (pointIndex !== index) {
            return point;
          }

          return {
            ...point,
            x: snapRoomCoordinate(x, snapSize, room.width),
            y: snapRoomCoordinate(y, snapSize, room.height),
          };
        }),
      },
    };

    setRoom(nextRoom);
    setItems((currentItems) => clampItemsToRoom(nextRoom, currentItems));
  };

  const addRoomPoint = (afterIndex: number, x: number, y: number) => {
    recordHistory();

    const points = getRoomShape(room).points;
    const insertIndex = clamp(afterIndex + 1, 0, points.length);
    const nextRoom: Room = {
      ...room,
      shape: {
        ...getRoomShape(room),
        points: [
          ...points.slice(0, insertIndex),
          {
            id: `point-${Date.now()}`,
            x: snapRoomCoordinate(x, snapSize, room.width),
            y: snapRoomCoordinate(y, snapSize, room.height),
          },
          ...points.slice(insertIndex),
        ],
      },
    };

    setRoom(nextRoom);
    setItems((currentItems) => clampItemsToRoom(nextRoom, currentItems));
  };

  const deleteRoomPoint = (index: number) => {
    const points = getRoomShape(room).points;

    if (points.length <= 3) {
      return;
    }

    recordHistory();

    const nextRoom: Room = {
      ...room,
      shape: {
        ...getRoomShape(room),
        points: points.filter((_, pointIndex) => pointIndex !== index),
      },
    };

    setRoom(nextRoom);
    setItems((currentItems) => clampItemsToRoom(nextRoom, currentItems));
  };


  const addPillar = () => {
    recordHistory();

    const pillarSize = 56;
    const snappedPillarSize = snapSize === 0 ? pillarSize : snapValue(pillarSize, snapSize);
    const nextObstacle: RoomObstacle = {
      id: createObstacleId(),
      type: 'rect',
      label: '기둥',
      width: snappedPillarSize,
      height: snappedPillarSize,
      x: snapRoomCoordinate(room.width / 2 - snappedPillarSize / 2, snapSize, room.width - snappedPillarSize),
      y: snapRoomCoordinate(room.height / 2 - snappedPillarSize / 2, snapSize, room.height - snappedPillarSize),
    };
    const nextRoom: Room = {
      ...room,
      shape: {
        ...getRoomShape(room),
        obstacles: [...getRoomShape(room).obstacles, nextObstacle],
      },
    };

    setRoom(nextRoom);
    setItems((currentItems) => clampItemsToRoom(nextRoom, currentItems));
  };

  const addNote = (x: number, y: number) => {
    recordHistory();
    const nextNote: LayoutNote = {
      id: createNoteId(),
      text: '새 메모',
      x: clamp(Math.round(x), 0, room.width),
      y: clamp(Math.round(y), 0, room.height),
    };

    setNotes((currentNotes) => [...currentNotes, nextNote]);
    return nextNote.id;
  };

  const updateNote = (id: string, update: Partial<Pick<LayoutNote, 'text' | 'x' | 'y'>>) => {
    setNotes((currentNotes) =>
      currentNotes.map((note) => {
        if (note.id !== id) {
          return note;
        }

        return {
          ...note,
          text: update.text ?? note.text,
          x: update.x === undefined ? note.x : clamp(Math.round(update.x), 0, room.width),
          y: update.y === undefined ? note.y : clamp(Math.round(update.y), 0, room.height),
        };
      }),
    );
  };

  const beginNoteMove = () => {
    recordHistory();
  };

  const deleteNote = (id: string) => {
    recordHistory();
    setNotes((currentNotes) => currentNotes.filter((note) => note.id !== id));
  };

  const deleteRoomObstacle = (id: string) => {
    recordHistory();
    setRoom((currentRoom) => ({
      ...currentRoom,
      shape: {
        ...getRoomShape(currentRoom),
        obstacles: getRoomShape(currentRoom).obstacles.filter((obstacle) => obstacle.id !== id),
      },
    }));
  };

  const updateRoomObstacle = (id: string, update: Partial<Extract<RoomObstacle, { type: 'rect' }>>) => {
    recordHistory();

    const nextRoom: Room = {
      ...room,
      shape: {
        ...getRoomShape(room),
        obstacles: getRoomShape(room).obstacles.map((obstacle) => {
          if (obstacle.id !== id || obstacle.type !== 'rect') {
            return obstacle;
          }

          const nextObstacle = {
            ...obstacle,
            ...update,
          };
          const nextSize = {
            width: clamp(snapValue(Math.round(nextObstacle.width), snapSize), 20, room.width),
            height: clamp(snapValue(Math.round(nextObstacle.height), snapSize), 20, room.height),
          };
          const snappedPosition = {
            x: snapRoomCoordinate(nextObstacle.x, snapSize, room.width - nextSize.width),
            y: snapRoomCoordinate(nextObstacle.y, snapSize, room.height - nextSize.height),
          };
          const clampedPosition = clampPositionToRoomBounds(room, nextSize, snappedPosition.x, snappedPosition.y);

          return {
            ...nextObstacle,
            ...nextSize,
            ...clampedPosition,
          };
        }),
      },
    };

    setRoom(nextRoom);
    setItems((currentItems) => clampItemsToRoom(nextRoom, currentItems));
  };

  const saveRoom = (name: string, memo: string = '') => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return null;
    }

    const now = new Date().toISOString();
    const nextRoom: SavedRoom = {
      schemaVersion: 7,
      id: createSavedRoomId(),
      name: trimmedName,
      memo: memo.trim(),
      room,
      updatedAt: now,
    };

    setSavedRooms((currentRooms) => {
      const nextRooms = [nextRoom, ...currentRooms];
      persistSavedRooms(nextRooms);
      return nextRooms;
    });
    setCurrentRoomId(nextRoom.id);
    return nextRoom.id;
  };

  const updateCurrentRoom = () => {
    if (!currentRoomId) return;

    setSavedRooms((currentRooms) => {
      const nextRooms = currentRooms.map((savedRoom) => {
        if (savedRoom.id !== currentRoomId) {
          return savedRoom;
        }

        return {
          ...savedRoom,
          room,
          updatedAt: new Date().toISOString(),
        };
      });
      persistSavedRooms(nextRooms);
      return nextRooms;
    });
  };

  const loadRoom = (id: string) => {
    const savedRoom = savedRooms.find((candidate) => candidate.id === id);

    if (!savedRoom) {
      return;
    }

    recordHistory();
    nextObstacleId = getNextObstacleId(savedRoom.room);
    setRoom(savedRoom.room);
    setItems([]);
    setNotes([]);
    setSelectedId(null);
    setCurrentRoomId(savedRoom.id);
    setCurrentLayoutId(null);
  };

  const deleteRoom = (id: string) => {
    setSavedRooms((currentRooms) => {
      const nextRooms = currentRooms.filter((savedRoom) => savedRoom.id !== id);
      persistSavedRooms(nextRooms);
      return nextRooms;
    });
    setSavedLayouts((currentLayouts) => {
      const nextLayouts = currentLayouts.filter((layout) => layout.roomId !== id);
      persistSavedLayouts(nextLayouts);
      return nextLayouts;
    });
    if (id === currentRoomId) {
      setCurrentRoomId(null);
      setCurrentLayoutId(null);
    }
  };

  const saveLayout = (name: string, memo: string = '') => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    const now = new Date().toISOString();
    const roomId = currentRoomId ?? saveRoom(`${trimmedName} 방`, '');

    if (!roomId) {
      return;
    }

    const nextLayout: SavedLayout = {
      schemaVersion: 7,
      notes,
      id: createSavedLayoutId(),
      roomId,
      name: trimmedName,
      memo: memo.trim(),
      items,
      updatedAt: now,
    };

    setSavedLayouts((currentLayouts) => {
      const nextLayouts = [nextLayout, ...currentLayouts];
      persistSavedLayouts(nextLayouts);
      return nextLayouts;
    });
    setCurrentRoomId(roomId);
    setCurrentLayoutId(nextLayout.id);
  };

  const loadLayout = (id: string) => {
    const layout = savedLayouts.find((savedLayout) => savedLayout.id === id);

    if (!layout) {
      return;
    }

    const layoutRoom = savedRooms.find((savedRoom) => savedRoom.id === layout.roomId);

    if (!layoutRoom) {
      return;
    }

    recordHistory();

    nextFurnitureId = getNextFurnitureId(layout.items);
    nextObstacleId = getNextObstacleId(layoutRoom.room);
    nextNoteId = getNextNoteId(layout.notes);
    setRoom(layoutRoom.room);
    setItems(clampItemsToRoom(layoutRoom.room, layout.items));
    setNotes(layout.notes);
    setSelectedId(null);
    setCurrentRoomId(layoutRoom.id);
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
          roomId: currentRoomId ?? layout.roomId,
          items,
          notes,
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
    catalog,
    customFurnitureCatalog,
    items,
    notes,
    selectedId,
    selectedItem,
    currentLayout,
    currentRoom,
    hasUnsavedChanges,
    hasUnsavedRoomChanges,
    overlappingItemIds,
    isSelfIntersecting,
    snapSize,
    savedRooms,
    savedLayouts,
    canUndo: pastLayouts.length > 0,
    canRedo: futureLayouts.length > 0,
    addFurniture,
    addCustomFurnitureTemplate,
    selectFurniture,
    beginFurnitureMove,
    moveFurniture,
    updateFurnitureGeometry,
    renameFurniture,
    rotateFurniture,
    updateDoorSwing,
    duplicateFurniture,
    deleteFurniture,
    setSnapSize,
    resetLayout,
    resizeRoom,
    applyRoomShapePreset,
    applyRoomJson,
    beginRoomShapeEdit,
    moveRoomPoint,
    addRoomPoint,
    deleteRoomPoint,
    addPillar,
    addNote,
    updateNote,
    beginNoteMove,
    deleteNote,
    deleteRoomObstacle,
    updateRoomObstacle,
    saveRoom,
    loadRoom,
    deleteRoom,
    updateCurrentRoom,
    saveLayout,
    loadLayout,
    deleteLayout,
    updateLayoutMeta,
    currentLayoutId,
    currentRoomId,
    updateCurrentLayout,
    undoLayoutChange,
    redoLayoutChange,
    copyFurniture,
    pasteFurniture,
  };
}
