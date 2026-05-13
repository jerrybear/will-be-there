import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoomLayout } from './useRoomLayout';
import { CURRENT_SCHEMA_VERSION } from './layoutStorage';
import { buildSharedLayoutUrl, createSharedLayoutPayload } from './sharedLayout';
import { createRectRoom } from '../utils/geometry';

describe('useRoomLayout hook', () => {
  let storageState: Record<string, string>;

  beforeEach(() => {
    storageState = {};
    window.location.hash = '';
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storageState[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storageState[key] = value;
      }),
      clear: vi.fn(() => {
        storageState = {};
      }),
      removeItem: vi.fn((key: string) => {
        delete storageState[key];
      }),
    });
    vi.clearAllMocks();
  });

  it('should initialize with default room and no items', () => {
    const { result } = renderHook(() => useRoomLayout());
    
    expect(result.current.room.width).toBe(7200);
    expect(result.current.room.height).toBe(4800);
    expect(result.current.room.wallHeight).toBe(2400);
    expect(result.current.items).toHaveLength(0);
  });

  it('should add furniture', () => {
    const { result } = renderHook(() => useRoomLayout());
    
    act(() => {
      result.current.addFurniture('bed');
    });
    
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].templateId).toBe('bed');
    expect(result.current.items[0].threeModel).toBe('bed_frame');
    expect(result.current.selectedId).toBe(result.current.items[0].id);
  });

  it('should move furniture within room bounds', () => {
    const { result } = renderHook(() => useRoomLayout());
    
    act(() => {
      result.current.addFurniture('bed');
    });
    
    const itemId = result.current.items[0].id;
    
    act(() => {
      result.current.moveFurniture(itemId, 100, 100);
    });
    
    expect(result.current.items[0].x).toBe(100);
    expect(result.current.items[0].y).toBe(100);
  });

  it('should clamp furniture position within room bounds', () => {
    const { result } = renderHook(() => useRoomLayout());
    
    act(() => {
      result.current.addFurniture('bed');
    });
    
    const item = result.current.items[0];
    const itemId = item.id;
    
    act(() => {
      result.current.moveFurniture(itemId, 2000, 2000);
    });
    
    expect(result.current.items[0].x).toBeLessThan(7200);
    expect(result.current.items[0].y).toBeLessThan(4800);
  });

  it('should handle undo and redo', () => {
    const { result } = renderHook(() => useRoomLayout());
    
    act(() => {
      result.current.addFurniture('bed');
    });
    expect(result.current.items).toHaveLength(1);
    
    act(() => {
      result.current.undoLayoutChange();
    });
    expect(result.current.items).toHaveLength(0);
    
    act(() => {
      result.current.redoLayoutChange();
    });
    expect(result.current.items).toHaveLength(1);
  });

  it('should resize the room', () => {
    const { result } = renderHook(() => useRoomLayout());
    
    act(() => {
      result.current.resizeRoom(8000, 6000, 2700);
    });
    
    expect(result.current.room.width).toBe(8000);
    expect(result.current.room.height).toBe(6000);
    expect(result.current.room.wallHeight).toBe(2700);
  });

  it('should delete furniture', () => {
    const { result } = renderHook(() => useRoomLayout());
    
    act(() => {
      result.current.addFurniture('bed');
    });
    const itemId = result.current.items[0].id;
    
    act(() => {
      result.current.deleteFurniture(itemId);
    });
    
    expect(result.current.items).toHaveLength(0);
    expect(result.current.selectedId).toBeNull();
  });

  it('should add a custom furniture template to the catalog', () => {
    const { result } = renderHook(() => useRoomLayout());

    act(() => {
      result.current.addCustomFurnitureTemplate({
        label: '협탁',
        category: 'storage',
        width: 48,
        height: 40,
        objectHeight: 52,
        color: '#123456',
      });
    });

    const customItem = result.current.catalog.find((item) => item.label === '협탁');

    expect(customItem).toBeTruthy();
    expect(customItem?.kind).toBe('furniture');
    expect(customItem?.isWallAttached).toBe(false);
    expect(customItem?.threeModel).toBe('box');
  });

  it('should place furniture created from a custom template', () => {
    const { result } = renderHook(() => useRoomLayout());

    let customTemplateId: string | null = null;

    act(() => {
      customTemplateId = result.current.addCustomFurnitureTemplate({
        label: '협탁',
        category: 'storage',
        width: 48,
        height: 40,
        objectHeight: 52,
        color: '#123456',
      });
    });

    expect(customTemplateId).toBeTruthy();

    act(() => {
      result.current.addFurniture(customTemplateId as string);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].templateId).toBe(customTemplateId);
    expect(result.current.items[0].label).toBe('협탁');
    expect(result.current.items[0].threeModel).toBe('box');
  });

  it('should load custom furniture catalog from local storage on init', () => {
    storageState['virtual-room-layout:custom-furniture-catalog'] = JSON.stringify({
      schemaVersion: 5,
      items: [
        {
          id: 'custom-furniture-seed',
          label: '커스텀 선반',
          category: 'storage',
          width: 80,
          height: 32,
          objectHeight: 180,
          color: '#654321',
          kind: 'furniture',
          threeModel: 'box',
          elevation: 0,
          isWallAttached: false,
        },
      ],
    });

    const { result } = renderHook(() => useRoomLayout());

    expect(result.current.catalog.some((item) => item.id === 'custom-furniture-seed')).toBe(true);
  });

  it('should add notes and persist them with a saved layout', () => {
    const { result } = renderHook(() => useRoomLayout());

    let noteId = '';

    act(() => {
      noteId = result.current.addNote(120, 140);
      result.current.updateNote(noteId, { text: '침대 후보 위치' });
    });

    act(() => {
      result.current.saveLayout('메모 포함 도면', '');
    });

    expect(result.current.notes).toHaveLength(1);
    expect(result.current.notes[0].text).toBe('침대 후보 위치');

    const storedLayouts = JSON.parse(storageState['virtual-room-layout:saved-layouts']);
    expect(storedLayouts.layouts[0].notes).toHaveLength(1);
    expect(storedLayouts.layouts[0].notes[0].text).toBe('침대 후보 위치');
  });

  it('should initialize from a shared link without merging into saved libraries', () => {
    storageState['virtual-room-layout:saved-rooms'] = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      rooms: [
        {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          id: 'room-local',
          name: '로컬 방',
          memo: '',
          room: createRectRoom(5000, 4000),
          updatedAt: '2026-05-13T00:00:00.000Z',
        },
      ],
    });

    const sharedRoom = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: 'room-shared',
      name: '공유 방',
      memo: '',
      room: createRectRoom(7200, 4800),
      updatedAt: '2026-05-13T01:00:00.000Z',
    };
    const sharedLayout = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: 'layout-shared',
      roomId: sharedRoom.id,
      name: '공유 도면',
      memo: '',
      items: [],
      notes: [{ id: 'note-1', x: 10, y: 20, text: '공유 메모' }],
      updatedAt: '2026-05-13T01:00:00.000Z',
    };

    window.location.hash = new URL(buildSharedLayoutUrl(createSharedLayoutPayload(sharedRoom, sharedLayout), 'http://localhost/')).hash;

    const { result } = renderHook(() => useRoomLayout());

    expect(result.current.currentLayoutName).toBe('공유 도면');
    expect(result.current.room.width).toBe(7200);
    expect(result.current.notes[0].text).toBe('공유 메모');
    expect(result.current.savedRooms).toHaveLength(1);
    expect(result.current.savedRooms[0].id).toBe('room-local');
    expect(result.current.savedLayouts).toHaveLength(0);
  });
});
