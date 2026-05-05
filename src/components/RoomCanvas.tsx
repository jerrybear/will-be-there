import { useEffect, useRef, useState } from 'react';
import type { PlacedFurniture, Room } from '../types/layout';
import { useCanvasViewport } from '../hooks/useCanvasViewport';
import { getRoomOutlinePoints, getRoomShape, getSvgPoints } from '../utils/geometry';
import { CanvasFurnitureItem } from './CanvasFurnitureItem';

interface RoomCanvasProps {
  room: Room;
  items: PlacedFurniture[];
  selectedId: string | null;
  isRoomEditingEnabled: boolean;
  isSelfIntersecting: boolean;
  overlappingItemIds: Set<string>;
  onSelect: (id: string | null) => void;
  onMoveStart: () => void;
  onMove: (id: string, x: number, y: number) => void;
  onRoomPointMoveStart: () => void;
  onRoomPointMove: (index: number, x: number, y: number) => void;
  onRoomPointAdd: (afterIndex: number, x: number, y: number) => void;
  onRoomPointDelete: (index: number) => void;
}

interface DragState {
  id: string;
  pointerOffsetX: number;
  pointerOffsetY: number;
}

interface PointDragState {
  index: number;
}

export function RoomCanvas({
  room,
  items,
  selectedId,
  isRoomEditingEnabled,
  isSelfIntersecting,
  overlappingItemIds,
  onSelect,
  onMoveStart,
  onMove,
  onRoomPointMoveStart,
  onRoomPointMove,
  onRoomPointAdd,
  onRoomPointDelete,
}: RoomCanvasProps) {
  const roomRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [pointDragState, setPointDragState] = useState<PointDragState | null>(null);
  const roomOutline = getRoomOutlinePoints(room);
  const roomOutlinePoints = getSvgPoints(getRoomOutlinePoints(room));
  const roomShape = getRoomShape(room);
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

  useEffect(() => {
    if (!pointDragState) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const roomElement = roomRef.current;

      if (!roomElement) {
        return;
      }

      const roomRect = roomElement.getBoundingClientRect();
      const nextX = (event.clientX - roomRect.left) / zoom;
      const nextY = (event.clientY - roomRect.top) / zoom;

      onRoomPointMove(pointDragState.index, nextX, nextY);
    };

    const handlePointerUp = () => {
      setPointDragState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [onRoomPointMove, pointDragState, zoom]);

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

  const handleRoomPointPointerDown = (event: React.PointerEvent<SVGCircleElement>, index: number) => {
    if (!isRoomEditingEnabled || event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    onSelect(null);

    if (event.altKey) {
      onRoomPointDelete(index);
      return;
    }

    onRoomPointMoveStart();
    setPointDragState({ index });
  };

  const handleWallPointerDown = (event: React.PointerEvent<SVGLineElement>, afterIndex: number) => {
    if (!isRoomEditingEnabled || event.button !== 0 || event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) {
      return;
    }

    const roomElement = roomRef.current;

    if (!roomElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelect(null);

    const roomRect = roomElement.getBoundingClientRect();
    const nextX = (event.clientX - roomRect.left) / zoom;
    const nextY = (event.clientY - roomRect.top) / zoom;

    onRoomPointAdd(afterIndex, nextX, nextY);
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
            <svg className="room-shape-layer" viewBox={`0 0 ${room.width} ${room.height}`} aria-hidden="true">
              <polygon className="room-shape-fill" points={roomOutlinePoints} />
              {roomShape.obstacles.map((obstacle) => {
                if (obstacle.type === 'rect') {
                  return (
                    <rect
                      key={obstacle.id}
                      className="room-obstacle"
                      x={obstacle.x}
                      y={obstacle.y}
                      width={obstacle.width}
                      height={obstacle.height}
                    />
                  );
                }

                return <polygon key={obstacle.id} className="room-obstacle" points={getSvgPoints(obstacle.points)} />;
              })}
              <polygon className={`room-shape-outline ${isSelfIntersecting ? 'is-self-intersecting' : ''}`} points={roomOutlinePoints} />
              {isRoomEditingEnabled && (
                <>
                  {roomOutline.map((point, index) => {
                    const nextPoint = roomOutline[(index + 1) % roomOutline.length];

                    return (
                      <line
                        key={`wall-hit-${index}`}
                        className="room-wall-hit-area"
                        x1={point.x}
                        y1={point.y}
                        x2={nextPoint.x}
                        y2={nextPoint.y}
                        onPointerDown={(event) => handleWallPointerDown(event, index)}
                      />
                    );
                  })}
                  {roomOutline.map((point, index) => (
                    <circle
                      key={`${index}-${point.x}-${point.y}`}
                      className={`room-point-handle ${isSelfIntersecting ? 'is-self-intersecting' : ''}`}
                      cx={point.x}
                      cy={point.y}
                      r={7}
                      onPointerDown={(event) => handleRoomPointPointerDown(event, index)}
                    />
                  ))}
                </>
              )}
              {isSelfIntersecting && isRoomEditingEnabled && (
                <g className="self-intersection-warning-overlay">
                  <polygon className="room-shape-outline-error" points={roomOutlinePoints} />
                </g>
              )}
            </svg>

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
      {isSelfIntersecting && isRoomEditingEnabled && (
        <div className="self-intersection-banner">
          ⚠️ 벽이 교차하고 있습니다. 꼭짓점을 이동하여 교차를 해소해 주세요.
        </div>
      )}
      <div className="zoom-controls">
        <button type="button" onClick={zoomOut}>-</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={zoomIn}>+</button>
        <button type="button" onClick={resetViewport}>초기화</button>
      </div>
    </section>
  );
}
