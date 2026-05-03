import { useEffect, useRef, useState } from 'react';
import type { PlacedFurniture, Room } from '../types/layout';
import { getRotatedSize } from '../types/layout';

interface RoomCanvasProps {
  room: Room;
  items: PlacedFurniture[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
}

interface DragState {
  id: string;
  pointerOffsetX: number;
  pointerOffsetY: number;
}

export function RoomCanvas({ room, items, selectedId, onSelect, onMove }: RoomCanvasProps) {
  const roomRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

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
      const nextX = event.clientX - roomRect.left - dragState.pointerOffsetX;
      const nextY = event.clientY - roomRect.top - dragState.pointerOffsetY;

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
  }, [dragState, onMove]);

  const handleItemPointerDown = (event: React.PointerEvent<HTMLButtonElement>, item: PlacedFurniture) => {
    const roomElement = roomRef.current;

    if (!roomElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelect(item.id);

    const roomRect = roomElement.getBoundingClientRect();
    setDragState({
      id: item.id,
      pointerOffsetX: event.clientX - roomRect.left - item.x,
      pointerOffsetY: event.clientY - roomRect.top - item.y,
    });
  };

  return (
    <section className="panel canvas-panel">
      <div className="panel-header">
        <h2>방 편집 화면</h2>
        <p>가구를 클릭해서 선택하고 드래그로 위치를 옮겨보세요.</p>
      </div>

      <div className="room-shell">
        <div
          ref={roomRef}
          className="room-canvas"
          style={{ width: room.width, height: room.height }}
          onPointerDown={() => onSelect(null)}
        >
          <div className="room-label">고정된 직사각형 방</div>

          {items.map((item) => {
            const footprint = getRotatedSize(item);

            return (
              <button
                key={item.id}
                type="button"
                className={`furniture-item ${selectedId === item.id ? 'is-selected' : ''}`}
                style={{
                  left: item.x,
                  top: item.y,
                  width: footprint.width,
                  height: footprint.height,
                  backgroundColor: item.color,
                }}
                onPointerDown={(event) => handleItemPointerDown(event, item)}
              >
                <span>{item.label}</span>
                <span className="furniture-rotation">{item.rotation}°</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
