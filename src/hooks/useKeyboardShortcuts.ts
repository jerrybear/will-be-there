import { useEffect } from 'react';
import type { PlacedFurniture, SnapSize } from '../types/layout';

interface KeyboardShortcutsProps {
  selectedId: string | null;
  selectedItem: PlacedFurniture | null;
  snapSize: SnapSize;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onCopy: (id: string) => void;
  onPaste: () => void;
  onMove: (id: string, x: number, y: number) => void;
  onRotate: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSnapSizeChange: (size: SnapSize) => void;
  isRoomEditingEnabled: boolean;
}

export function useKeyboardShortcuts({
  selectedId,
  selectedItem,
  snapSize,
  onSelect,
  onDelete,
  onCopy,
  onPaste,
  onMove,
  onRotate,
  onUndo,
  onRedo,
  onSnapSizeChange,
  isRoomEditingEnabled,
}: KeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const isMod = event.ctrlKey || event.metaKey;
      const isShift = event.shiftKey;

      // 1. Selection & Basic Actions
      if (event.key === 'Escape') {
        onSelect(null);
      }

      if (selectedId && (event.key === 'Delete' || event.key === 'Backspace')) {
        onDelete(selectedId);
      }

      if (isMod && event.key === 'c' && selectedId) {
        event.preventDefault();
        onCopy(selectedId);
      }

      if (isMod && event.key === 'v') {
        event.preventDefault();
        onPaste();
      }

      // 2. Nudging & Rotation
      if (selectedItem) {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          
          let nextX = selectedItem.x;
          let nextY = selectedItem.y;
          
          const getNudge = (current: number, direction: -1 | 1) => {
            if (isShift) {
              // Shift + Arrow: ignore setting, move by default snap unit (24)
              return current + direction * 24;
            }
            
            if (snapSize > 0) {
              // Snap enabled: check if current is aligned
              const isSnapped = Math.abs(current % snapSize) < 0.1;
              if (isSnapped) {
                return current + direction * snapSize;
              } else {
                // First nudge: move to closest snap point in that direction
                return direction > 0 
                  ? Math.ceil((current + 0.1) / snapSize) * snapSize
                  : Math.floor((current - 0.1) / snapSize) * snapSize;
              }
            } else {
              // Snap disabled: 1px nudge
              return current + direction;
            }
          };

          if (event.key === 'ArrowLeft') nextX = getNudge(selectedItem.x, -1);
          if (event.key === 'ArrowRight') nextX = getNudge(selectedItem.x, 1);
          if (event.key === 'ArrowUp') nextY = getNudge(selectedItem.y, -1);
          if (event.key === 'ArrowDown') nextY = getNudge(selectedItem.y, 1);
          
          onMove(selectedItem.id, nextX, nextY);
        }

        if (event.key.toLowerCase() === 'r') {
          onRotate(selectedItem.id);
        }
      }

      // 3. Undo/Redo
      if (isMod && event.key === 'z') {
        event.preventDefault();
        if (isShift) {
          onRedo();
        } else {
          onUndo();
        }
      }
      if (isMod && event.key === 'y') {
        event.preventDefault();
        onRedo();
      }

      // 5. Other
      if (event.key.toLowerCase() === 's') {
        // Toggle snapping: if snapSize > 0, set to 0. Otherwise set to 24.
        onSnapSizeChange(snapSize > 0 ? 0 : 24);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedId,
    selectedItem,
    snapSize,
    onSelect,
    onDelete,
    onCopy,
    onPaste,
    onMove,
    onRotate,
    onUndo,
    onRedo,
    onSnapSizeChange,
  ]);
}
