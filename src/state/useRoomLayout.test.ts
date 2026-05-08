import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoomLayout } from './useRoomLayout';

describe('useRoomLayout hook', () => {
  let storageState: Record<string, string>;

  beforeEach(() => {
    storageState = {};
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
    
    expect(result.current.room.width).toBe(720);
    expect(result.current.room.height).toBe(480);
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
    
    expect(result.current.items[0].x).toBeLessThan(720);
    expect(result.current.items[0].y).toBeLessThan(480);
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
      result.current.resizeRoom(800, 600);
    });
    
    expect(result.current.room.width).toBe(800);
    expect(result.current.room.height).toBe(600);
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
});
