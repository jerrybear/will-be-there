import { useEffect, useRef, useState } from 'react';
import type { PlacedFurniture, Room } from '../types/layout';
import { getRotatedSize } from '../types/layout';

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
    onMoveStart();

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
          <div className="room-label">크기 조절 가능한 방</div>

          {items.map((item) => {
            const footprint = getRotatedSize(item);

            const isOverlapping = overlappingItemIds.has(item.id);
            const isDoor = item.templateId === 'door';

            let swingStyle: React.CSSProperties | undefined;
            if (isDoor && item.doorSwing != null) {
              const R = Math.max(item.width, item.height);
              const isHorizontal = footprint.width > footprint.height;
              
              if (isHorizontal) {
                 if (item.doorSwing === 0) swingStyle = { left: 0, top: -R, width: R, height: R, borderTopRightRadius: '100%', borderTop: '1.5px solid #64748b', borderRight: '1.5px solid #64748b' };
                 else if (item.doorSwing === 1) swingStyle = { right: 0, top: -R, width: R, height: R, borderTopLeftRadius: '100%', borderTop: '1.5px solid #64748b', borderLeft: '1.5px solid #64748b' };
                 else if (item.doorSwing === 2) swingStyle = { left: 0, top: footprint.height, width: R, height: R, borderBottomRightRadius: '100%', borderBottom: '1.5px solid #64748b', borderRight: '1.5px solid #64748b' };
                 else if (item.doorSwing === 3) swingStyle = { right: 0, top: footprint.height, width: R, height: R, borderBottomLeftRadius: '100%', borderBottom: '1.5px solid #64748b', borderLeft: '1.5px solid #64748b' };
              } else {
                 if (item.doorSwing === 0) swingStyle = { left: -R, top: 0, width: R, height: R, borderBottomLeftRadius: '100%', borderBottom: '1.5px solid #64748b', borderLeft: '1.5px solid #64748b' };
                 else if (item.doorSwing === 1) swingStyle = { left: -R, bottom: 0, width: R, height: R, borderTopLeftRadius: '100%', borderTop: '1.5px solid #64748b', borderLeft: '1.5px solid #64748b' };
                 else if (item.doorSwing === 2) swingStyle = { left: footprint.width, top: 0, width: R, height: R, borderBottomRightRadius: '100%', borderBottom: '1.5px solid #64748b', borderRight: '1.5px solid #64748b' };
                 else if (item.doorSwing === 3) swingStyle = { left: footprint.width, bottom: 0, width: R, height: R, borderTopRightRadius: '100%', borderTop: '1.5px solid #64748b', borderRight: '1.5px solid #64748b' };
              }
            }

            return (
              <button
                key={item.id}
                type="button"
                className={`furniture-item ${selectedId === item.id ? 'is-selected' : ''} ${item.isWallAttached ? 'is-wall-attached' : ''} ${isOverlapping ? 'is-overlapping' : ''} ${isDoor ? 'is-door' : ''}`}
                style={{
                  left: item.x,
                  top: item.y,
                  width: footprint.width,
                  height: footprint.height,
                  backgroundColor: item.color,
                }}
                onPointerDown={(event) => handleItemPointerDown(event, item)}
              >
                {swingStyle && <div className="door-swing-arc" style={swingStyle} />}
                <span>{item.label}</span>
                <span className="furniture-rotation">{item.rotation}°</span>
                {isOverlapping && <span className="overlap-badge" title="다른 가구와 겹침">⚠️</span>}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
