import { useEffect, useRef, useState } from 'react';
import type { PlacedFurniture, Room } from '../types/layout';
import { useCanvasViewport } from '../hooks/useCanvasViewport';
import { CanvasFurnitureItem } from './CanvasFurnitureItem';

interface RoomCanvasProps {
  room: Room;
  items: PlacedFurniture[];
  selectedId: string | null;
  overlappingItemIds: Set<string>;
  onSelect: (id: string | null) => void;
  onMoveStart: () => void;
  onMove: (id: string, x: number, y: number) => void;
}

interface DragState {
  id: string;
  pointerOffsetX: number;
  pointerOffsetY: number;
}

export function RoomCanvas({ room, items, selectedId, overlappingItemIds, onSelect, onMoveStart, onMove }: RoomCanvasProps) {
  const roomRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const {
    shellRef,
    zoom,
    pan,
    isSpaceDown,
    beginPan,
    updatePan,
    endPan,
    zoomIn,
    zoomOut,
    resetViewport,
  } = useCanvasViewport();

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const roomElement = roomRef.current;

      if (!roomElement) {
        return;
      }

      const roomRect = roomElement.getBoundingClientRect();
      const nextX = (event.clientX - roomRect.left) / zoom - dragState.pointerOffsetX;
      const nextY = (event.clientY - roomRect.top) / zoom - dragState.pointerOffsetY;

      onMove(dragState.id, nextX, nextY);
    };

    const handlePointerUp = () => {
      setDragState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragState, onMove, zoom]);

  const handleShellPointerDown = (e: React.PointerEvent) => {
    const startedPan = beginPan(e);

    if (!startedPan) {
      onSelect(null);
    }
  };

  const handleShellPointerMove = (e: React.PointerEvent) => {
    updatePan(e);
  };

  const handleShellPointerUp = (e: React.PointerEvent) => {
    endPan(e);
  };

  const handleItemPointerDown = (event: React.PointerEvent<HTMLButtonElement>, item: PlacedFurniture) => {
    if (event.button !== 0 || isSpaceDown) return;
    const roomElement = roomRef.current;

    if (!roomElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelect(item.id);
    onMoveStart();

    const roomRect = roomElement.getBoundingClientRect();
    setDragState({
      id: item.id,
      pointerOffsetX: (event.clientX - roomRect.left) / zoom - item.x,
      pointerOffsetY: (event.clientY - roomRect.top) / zoom - item.y,
    });
  };

  return (
    <section className="panel canvas-panel">
      <div className="panel-header">
        <h2>방 편집 화면</h2>
        <p>가구를 클릭해서 선택하고 드래그로 위치를 옮겨보세요.</p>
      </div>

      <div className="room-shell-wrapper">
        <div 
          className={`room-shell ${isSpaceDown ? 'is-panning' : ''}`}
          ref={shellRef}
          onPointerDown={handleShellPointerDown}
          onPointerMove={handleShellPointerMove}
          onPointerUp={handleShellPointerUp}
          style={{ cursor: isSpaceDown ? 'grab' : 'default' }}
        >
          <div
            ref={roomRef}
            className="room-canvas"
            style={{ 
              width: room.width, 
              height: room.height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
          >
            <div className="room-label">크기 조절 가능한 방</div>

          {items.map((item) => (
            <CanvasFurnitureItem
              key={item.id}
              item={item}
              isSelected={selectedId === item.id}
              isOverlapping={overlappingItemIds.has(item.id)}
              onPointerDown={handleItemPointerDown}
            />
          ))}
        </div>
      </div>
      </div>
      <div className="zoom-controls">
        <button type="button" onClick={zoomOut}>-</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={zoomIn}>+</button>
        <button type="button" onClick={resetViewport}>초기화</button>
      </div>
    </section>
  );
}
