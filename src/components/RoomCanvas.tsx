import { useEffect, useRef, useState } from 'react';
import type { PlacedFurniture, Room } from '../types/layout';
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
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const panStartRef = useRef<{ clientX: number, clientY: number, panX: number, panY: number } | null>(null);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpaceDown(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpaceDown(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const zoomSensitivity = 0.002;
        setZoom((prevZoom) => {
          const newZoom = Math.max(0.1, Math.min(prevZoom - e.deltaY * zoomSensitivity, 5));
          setPan((prevPan) => {
            const rect = shell.getBoundingClientRect();
            const cursorX = e.clientX - rect.left;
            const cursorY = e.clientY - rect.top;
            const localX = (cursorX - prevPan.x) / prevZoom;
            const localY = (cursorY - prevPan.y) / prevZoom;
            return {
              x: cursorX - localX * newZoom,
              y: cursorY - localY * newZoom,
            };
          });
          return newZoom;
        });
      } else {
        setPan((prev) => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }));
      }
    };
    
    shell.addEventListener('wheel', handleWheel, { passive: false });
    return () => shell.removeEventListener('wheel', handleWheel);
  }, []);

  const handleShellPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || isSpaceDown) {
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    } else {
      onSelect(null);
    }
  };

  const handleShellPointerMove = (e: React.PointerEvent) => {
    if (panStartRef.current) {
      const dx = e.clientX - panStartRef.current.clientX;
      const dy = e.clientY - panStartRef.current.clientY;
      setPan({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      });
    }
  };

  const handleShellPointerUp = (e: React.PointerEvent) => {
    if (panStartRef.current) {
      panStartRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
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
        <button type="button" onClick={() => setZoom(z => Math.max(0.1, z - 0.2))}>-</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(z => Math.min(5, z + 0.2))}>+</button>
        <button type="button" onClick={() => { setZoom(1); setPan({x: 0, y: 0}); }}>초기화</button>
      </div>
    </section>
  );
}
