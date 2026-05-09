import { useEffect, useId, useRef, useState } from 'react';
import type { CanvasTool, LayoutNote, PlacedFurniture, Room, SnapSize } from '../types/layout';
import { useCanvasViewport } from '../hooks/useCanvasViewport';
import { getRoomOutlinePoints, getRoomShape, getSvgPoints } from '../utils/geometry';
import { CanvasFurnitureItem } from './CanvasFurnitureItem';

const DISPLAY_SCALE = 0.2;

interface RoomCanvasProps {
  room: Room;
  items: PlacedFurniture[];
  notes: LayoutNote[];
  selectedId: string | null;
  isRoomEditingEnabled: boolean;
  isSelfIntersecting: boolean;
  snapSize: SnapSize;
  overlappingItemIds: Set<string>;
  onSelect: (id: string | null) => void;
  onMoveStart: () => void;
  onMove: (id: string, x: number, y: number) => void;
  onRoomEditingChange: (enabled: boolean) => void;
  onRoomPointMoveStart: () => void;
  onRoomPointMove: (index: number, x: number, y: number) => void;
  onRoomPointAdd: (afterIndex: number, x: number, y: number) => void;
  onRoomPointDelete: (index: number) => void;
  onAddNote: (x: number, y: number) => string;
  onNoteMoveStart: () => void;
  onUpdateNote: (id: string, update: Partial<Pick<LayoutNote, 'text' | 'x' | 'y'>>) => void;
  onDeleteNote: (id: string) => void;
}

interface DragState {
  id: string;
  pointerOffsetX: number;
  pointerOffsetY: number;
}

interface PointDragState {
  index: number;
}

interface NoteDragState {
  id: string;
  pointerOffsetX: number;
  pointerOffsetY: number;
}

function getPolygonCentroid(points: { x: number; y: number }[]) {
  const total = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

function getCornerAngleDegrees(previousPoint: { x: number; y: number }, currentPoint: { x: number; y: number }, nextPoint: { x: number; y: number }) {
  const vectorA = {
    x: previousPoint.x - currentPoint.x,
    y: previousPoint.y - currentPoint.y,
  };
  const vectorB = {
    x: nextPoint.x - currentPoint.x,
    y: nextPoint.y - currentPoint.y,
  };
  const lengthA = Math.hypot(vectorA.x, vectorA.y);
  const lengthB = Math.hypot(vectorB.x, vectorB.y);

  if (lengthA < 0.001 || lengthB < 0.001) {
    return null;
  }

  const cosine = (vectorA.x * vectorB.x + vectorA.y * vectorB.y) / (lengthA * lengthB);
  const normalizedCosine = Math.max(-1, Math.min(1, cosine));

  return Math.round(Math.acos(normalizedCosine) * 180 / Math.PI);
}

export function RoomCanvas({
  room,
  items,
  notes,
  selectedId,
  isRoomEditingEnabled,
  isSelfIntersecting,
  snapSize,
  overlappingItemIds,
  onSelect,
  onMoveStart,
  onMove,
  onRoomEditingChange,
  onRoomPointMoveStart,
  onRoomPointMove,
  onRoomPointAdd,
  onRoomPointDelete,
  onAddNote,
  onNoteMoveStart,
  onUpdateNote,
  onDeleteNote,
}: RoomCanvasProps) {
  const roomRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [pointDragState, setPointDragState] = useState<PointDragState | null>(null);
  const [noteDragState, setNoteDragState] = useState<NoteDragState | null>(null);
  const [activeTool, setActiveTool] = useState<CanvasTool>('select');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(false);
  const [layerVisibility, setLayerVisibility] = useState({
    showGrid: true,
    showFurniture: true,
    showNotes: true,
  });
  const roomOutline = getRoomOutlinePoints(room);
  const roomOutlinePoints = getSvgPoints(getRoomOutlinePoints(room));
  const roomShape = getRoomShape(room);
  const roomCentroid = getPolygonCentroid(roomOutline);
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
    centerViewport,
    resetViewport,
  } = useCanvasViewport(room.width * DISPLAY_SCALE, room.height * DISPLAY_SCALE);
  const reactId = useId();
  const gridPatternId = `room-grid-${reactId.replace(/:/g, '')}`;
  const gridSize = snapSize || 24;
  const displayZoom = zoom * DISPLAY_SCALE;
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const focusX = selectedItem ? selectedItem.x : room.width / 2;
  const focusY = selectedItem ? selectedItem.y : room.height / 2;
  const shouldShowRoomDimensions = activeTool === 'dimensions' || isRoomEditingEnabled;
  const activeCornerAngles = pointDragState
    ? (() => {
        const currentIndex = pointDragState.index;
        const previousIndex = (currentIndex - 1 + roomOutline.length) % roomOutline.length;
        const nextIndex = (currentIndex + 1) % roomOutline.length;
        const targetIndices = [previousIndex, currentIndex, nextIndex];

        return targetIndices.flatMap((pointIndex) => {
          const prevIndex = (pointIndex - 1 + roomOutline.length) % roomOutline.length;
          const followingIndex = (pointIndex + 1) % roomOutline.length;
          const point = roomOutline[pointIndex];
          const previousPoint = roomOutline[prevIndex];
          const nextPoint = roomOutline[followingIndex];
          const angle = getCornerAngleDegrees(previousPoint, point, nextPoint);

          if (angle === null) {
            return [];
          }

          const vectorFromCenter = {
            x: point.x - roomCentroid.x,
            y: point.y - roomCentroid.y,
          };
          const vectorLength = Math.hypot(vectorFromCenter.x, vectorFromCenter.y) || 1;
          const unitVector = {
            x: vectorFromCenter.x / vectorLength,
            y: vectorFromCenter.y / vectorLength,
          };
          const labelOffset = pointIndex === currentIndex ? 28 : 22;

          return [{
            id: `corner-angle-${pointIndex}`,
            angle,
            x: point.x + unitVector.x * labelOffset,
            y: point.y + unitVector.y * labelOffset,
          }];
        });
      })()
    : [];
  const wallDimensionLabels = shouldShowRoomDimensions
    ? roomOutline.map((point, index) => {
        const nextPoint = roomOutline[(index + 1) % roomOutline.length];
        const length = Math.round(Math.hypot(nextPoint.x - point.x, nextPoint.y - point.y));
        const dx = nextPoint.x - point.x;
        const dy = nextPoint.y - point.y;
        const wallLength = Math.hypot(dx, dy) || 1;
        const midX = (point.x + nextPoint.x) / 2;
        const midY = (point.y + nextPoint.y) / 2;
        const normalA = { x: -dy / wallLength, y: dx / wallLength };
        const normalB = { x: dy / wallLength, y: -dx / wallLength };
        const toCenter = { x: roomCentroid.x - midX, y: roomCentroid.y - midY };
        const dotA = normalA.x * toCenter.x + normalA.y * toCenter.y;
        const outwardNormal = dotA < 0 ? normalA : normalB;

        return {
          id: `wall-dimension-${index}`,
          label: `${length}mm`,
          x: midX + outwardNormal.x * 20,
          y: midY + outwardNormal.y * 20,
          rotation: Math.abs(dx) < Math.abs(dy) ? 90 : 0,
        };
      })
    : [];

  useEffect(() => {
    setActiveTool(isRoomEditingEnabled ? 'walls' : 'select');
  }, [isRoomEditingEnabled]);

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
      const nextX = (event.clientX - roomRect.left) / displayZoom - dragState.pointerOffsetX;
      const nextY = (event.clientY - roomRect.top) / displayZoom - dragState.pointerOffsetY;

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
  }, [displayZoom, dragState, onMove]);

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
      const nextX = (event.clientX - roomRect.left) / displayZoom;
      const nextY = (event.clientY - roomRect.top) / displayZoom;

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
  }, [displayZoom, onRoomPointMove, pointDragState]);

  useEffect(() => {
    if (!noteDragState) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const roomElement = roomRef.current;

      if (!roomElement) {
        return;
      }

      const roomRect = roomElement.getBoundingClientRect();
      const nextX = (event.clientX - roomRect.left) / displayZoom - noteDragState.pointerOffsetX;
      const nextY = (event.clientY - roomRect.top) / displayZoom - noteDragState.pointerOffsetY;

      onUpdateNote(noteDragState.id, { x: nextX, y: nextY });
    };

    const handlePointerUp = () => {
      setNoteDragState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [displayZoom, noteDragState, onUpdateNote]);

  useEffect(() => {
    const shell = shellRef.current;

    if (!shell) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(() => {
      centerViewport();
    });

    resizeObserver.observe(shell);
    centerViewport();

    return () => {
      resizeObserver.disconnect();
    };
  }, [room.height, room.width, shellRef]);

  const handleShellPointerDown = (event: React.PointerEvent) => {
    if (activeTool === 'memo' && event.button === 0 && !isSpaceDown) {
      const roomElement = roomRef.current;

      if (!roomElement) {
        return;
      }

      const roomRect = roomElement.getBoundingClientRect();
      const noteId = onAddNote((event.clientX - roomRect.left) / displayZoom, (event.clientY - roomRect.top) / displayZoom);
      setSelectedNoteId(noteId);
      onSelect(null);
      return;
    }

    const startedPan = beginPan(event);

    if (!startedPan) {
      onSelect(null);
      setSelectedNoteId(null);
    }
  };

  const handleShellPointerMove = (event: React.PointerEvent) => {
    updatePan(event);
  };

  const handleShellPointerUp = (event: React.PointerEvent) => {
    endPan(event);
  };

  const handleItemPointerDown = (event: React.PointerEvent<HTMLButtonElement>, item: PlacedFurniture) => {
    if (event.button !== 0 || isSpaceDown || !layerVisibility.showFurniture) {
      return;
    }

    const roomElement = roomRef.current;

    if (!roomElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelect(item.id);
    setSelectedNoteId(null);
    onMoveStart();

    const roomRect = roomElement.getBoundingClientRect();
    setDragState({
      id: item.id,
      pointerOffsetX: (event.clientX - roomRect.left) / displayZoom - item.x,
      pointerOffsetY: (event.clientY - roomRect.top) / displayZoom - item.y,
    });
  };

  const handleNotePointerDown = (event: React.PointerEvent<HTMLDivElement>, note: LayoutNote) => {
    if (event.button !== 0 || isSpaceDown) {
      return;
    }

    const roomElement = roomRef.current;

    if (!roomElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setSelectedNoteId(note.id);
    onSelect(null);
    onNoteMoveStart();

    const roomRect = roomElement.getBoundingClientRect();
    setNoteDragState({
      id: note.id,
      pointerOffsetX: (event.clientX - roomRect.left) / displayZoom - note.x,
      pointerOffsetY: (event.clientY - roomRect.top) / displayZoom - note.y,
    });
  };

  const handleRoomPointPointerDown = (event: React.PointerEvent<SVGCircleElement>, index: number) => {
    if (!isRoomEditingEnabled || event.button !== 0) {
      return;
    }

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
    const nextX = (event.clientX - roomRect.left) / displayZoom;
    const nextY = (event.clientY - roomRect.top) / displayZoom;

    onRoomPointAdd(afterIndex, nextX, nextY);
  };

  const handleToolChange = (tool: CanvasTool) => {
    setActiveTool(tool);
    setIsLayerPanelOpen(false);
    onRoomEditingChange(tool === 'walls');

    if (tool === 'memo') {
      setLayerVisibility((currentState) => ({ ...currentState, showNotes: true }));
    }
  };

  return (
    <section className="panel canvas-panel">
      <div className="canvas-top-toolbar">
        <button type="button" className={activeTool === 'select' ? 'is-active' : ''} onClick={() => handleToolChange('select')}>
          선택
        </button>
        <button type="button" className={activeTool === 'walls' ? 'is-active' : ''} onClick={() => handleToolChange('walls')}>
          벽 편집
        </button>
        <button type="button" className={activeTool === 'dimensions' ? 'is-active' : ''} onClick={() => handleToolChange('dimensions')}>
          치수
        </button>
        <button type="button" className={activeTool === 'memo' ? 'is-active' : ''} onClick={() => handleToolChange('memo')}>
          메모
        </button>
        <button type="button" className={isLayerPanelOpen ? 'is-active' : ''} onClick={() => setIsLayerPanelOpen((current) => !current)}>
          레이어
        </button>
        {isLayerPanelOpen && (
          <div className="canvas-layer-panel">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={layerVisibility.showGrid}
                onChange={(event) => setLayerVisibility((currentState) => ({ ...currentState, showGrid: event.target.checked }))}
              />
              <span>그리드</span>
            </label>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={layerVisibility.showFurniture}
                onChange={(event) => setLayerVisibility((currentState) => ({ ...currentState, showFurniture: event.target.checked }))}
              />
              <span>가구</span>
            </label>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={layerVisibility.showNotes}
                onChange={(event) => setLayerVisibility((currentState) => ({ ...currentState, showNotes: event.target.checked }))}
              />
              <span>메모</span>
            </label>
          </div>
        )}
      </div>

      <div className="room-shell-wrapper">
        <div
          className={`room-shell ${isSpaceDown ? 'is-panning' : ''}`}
          ref={shellRef}
          onPointerDown={handleShellPointerDown}
          onPointerMove={handleShellPointerMove}
          onPointerUp={handleShellPointerUp}
          style={{ cursor: isSpaceDown ? 'grab' : activeTool === 'memo' ? 'copy' : 'default' }}
        >
          <div
            ref={roomRef}
            className="room-canvas"
            style={{
              width: room.width,
              height: room.height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${displayZoom})`,
              transformOrigin: '0 0',
            }}
          >
            <svg className="room-shape-layer" viewBox={`0 0 ${room.width} ${room.height}`} aria-hidden="true">
              <defs>
                <pattern id={gridPatternId} width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
                  <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} className="room-grid-line" />
                </pattern>
              </defs>
              <polygon className="room-shape-fill" points={roomOutlinePoints} />
              {layerVisibility.showGrid && <polygon className="room-shape-grid" points={roomOutlinePoints} fill={`url(#${gridPatternId})`} />}
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

            {layerVisibility.showFurniture && items.map((item) => (
              <CanvasFurnitureItem
                key={item.id}
                item={item}
                isSelected={selectedId === item.id}
                isOverlapping={overlappingItemIds.has(item.id)}
                showDimensions={activeTool === 'dimensions'}
                zoom={displayZoom}
                onPointerDown={handleItemPointerDown}
              />
            ))}

            {wallDimensionLabels.map((label) => (
              <div
                key={label.id}
                className="room-dimension-label"
                style={{
                  left: label.x,
                  top: label.y,
                  transform: `translate(-50%, -50%) rotate(${label.rotation}deg) scale(${1 / displayZoom})`,
                }}
              >
                {label.label}
              </div>
            ))}

            {activeCornerAngles.map((cornerAngle) => (
              <div
                key={cornerAngle.id}
                className="room-angle-label"
                style={{
                  left: cornerAngle.x,
                  top: cornerAngle.y,
                  transform: `translate(-50%, -50%) scale(${1 / displayZoom})`,
                }}
              >
                {cornerAngle.angle}°
              </div>
            ))}

            {layerVisibility.showNotes && notes.map((note) => (
              <div
                key={note.id}
                className={`layout-note ${selectedNoteId === note.id ? 'is-selected' : ''}`}
                style={{ left: note.x, top: note.y }}
                onPointerDown={(event) => handleNotePointerDown(event, note)}
              >
                <textarea
                  value={note.text}
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) => onUpdateNote(note.id, { text: event.target.value })}
                  onFocus={() => setSelectedNoteId(note.id)}
                  rows={2}
                />
                {selectedNoteId === note.id && (
                  <button
                    type="button"
                    className="layout-note-delete"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => onDeleteNote(note.id)}
                  >
                    삭제
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {isSelfIntersecting && isRoomEditingEnabled && (
        <div className="self-intersection-banner">
          벽이 교차하고 있습니다. 꼭짓점을 이동해 형태를 정리하세요.
        </div>
      )}
      <div className="zoom-controls">
        <button type="button" onClick={zoomOut}>-</button>
        <span>{Math.round(displayZoom * 100)}%</span>
        <button type="button" onClick={zoomIn}>+</button>
        <button type="button" onClick={resetViewport}>맞춤</button>
      </div>
      <div className="canvas-coordinates">
        X: {Math.round(focusX)}mm&nbsp;&nbsp;Y: {Math.round(focusY)}mm
      </div>
    </section>
  );
}
