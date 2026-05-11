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

interface Point2D {
  x: number;
  y: number;
}

const CORNER_SNAP_ANGLES = [30, 45, 90, 180] as const;
const ANGLE_SNAP_THRESHOLD_DEGREES = 4;

function DimensionsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7H19V17H5V7ZM7 9V15H17V9H7ZM9 11H15V13H9V11ZM4 5V7H2V5H4ZM22 5V7H20V5H22ZM4 17V19H2V17H4ZM22 17V19H20V17H22Z" fill="currentColor" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3L2 8L12 13L22 8L12 3ZM5.6 11L12 14.2L18.4 11L22 12.8L12 18L2 12.8L5.6 11ZM5.6 15L12 18.2L18.4 15L22 16.8L12 22L2 16.8L5.6 15Z" fill="currentColor" />
    </svg>
  );
}

function getPolygonCentroid(points: Point2D[]) {
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

function getCornerAngleDegrees(previousPoint: Point2D, currentPoint: Point2D, nextPoint: Point2D) {
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

  return Math.acos(normalizedCosine) * 180 / Math.PI;
}

function roundAngleForDisplay(angle: number) {
  return Math.round(angle * 100) / 100;
}

function getDistanceSquared(a: Point2D, b: Point2D) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function rotateVector(vector: Point2D, degrees: number) {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

function normalizeVector(vector: Point2D) {
  const length = Math.hypot(vector.x, vector.y);

  if (length < 0.001) {
    return null;
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function projectPointToRay(point: Point2D, origin: Point2D, direction: Point2D) {
  const normalizedDirection = normalizeVector(direction);

  if (!normalizedDirection) {
    return null;
  }

  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const projectionLength = Math.max(0, dx * normalizedDirection.x + dy * normalizedDirection.y);

  return {
    x: origin.x + normalizedDirection.x * projectionLength,
    y: origin.y + normalizedDirection.y * projectionLength,
  };
}

interface AngleRayCandidate {
  angle: number;
  origin: Point2D;
  direction: Point2D;
  projectedPoint: Point2D;
}

function getRayIntersection(first: AngleRayCandidate, second: AngleRayCandidate) {
  const firstDirection = normalizeVector(first.direction);
  const secondDirection = normalizeVector(second.direction);

  if (!firstDirection || !secondDirection) {
    return null;
  }

  const denominator = firstDirection.x * secondDirection.y - firstDirection.y * secondDirection.x;

  if (Math.abs(denominator) < 0.001) {
    return null;
  }

  const deltaX = second.origin.x - first.origin.x;
  const deltaY = second.origin.y - first.origin.y;
  const t = (deltaX * secondDirection.y - deltaY * secondDirection.x) / denominator;
  const u = (deltaX * firstDirection.y - deltaY * firstDirection.x) / denominator;

  if (t < 0 || u < 0) {
    return null;
  }

  return {
    x: first.origin.x + firstDirection.x * t,
    y: first.origin.y + firstDirection.y * t,
  };
}

function getAngleRayCandidates(
  targetPoint: Point2D,
  anchorPoint: Point2D,
  fixedNeighbor: Point2D,
) {
  const fixedVector = {
    x: fixedNeighbor.x - anchorPoint.x,
    y: fixedNeighbor.y - anchorPoint.y,
  };
  const currentAngle = getCornerAngleDegrees(fixedNeighbor, anchorPoint, targetPoint);

  if (currentAngle === null) {
    return [];
  }

  const candidates: AngleRayCandidate[] = [];

  CORNER_SNAP_ANGLES.forEach((targetAngle) => {
    if (Math.abs(currentAngle - targetAngle) > ANGLE_SNAP_THRESHOLD_DEGREES) {
      return;
    }

    [targetAngle, -targetAngle].forEach((signedAngle) => {
      const direction = rotateVector(fixedVector, signedAngle);
      const candidate = projectPointToRay(targetPoint, anchorPoint, direction);

      if (!candidate) {
        return;
      }

      const snappedAngle = getCornerAngleDegrees(fixedNeighbor, anchorPoint, candidate);

      if (snappedAngle === null || Math.abs(snappedAngle - targetAngle) > 0.25) {
        return;
      }

      candidates.push({
        angle: targetAngle,
        origin: anchorPoint,
        direction,
        projectedPoint: candidate,
      });
    });
  });

  return candidates;
}

function getSnappedPointFromAdjacentAngles(
  targetPoint: Point2D,
  previousPreviousPoint: Point2D,
  previousPoint: Point2D,
  nextPoint: Point2D,
  nextNextPoint: Point2D,
) {
  const previousCornerCandidates = getAngleRayCandidates(targetPoint, previousPoint, previousPreviousPoint);
  const nextCornerCandidates = getAngleRayCandidates(targetPoint, nextPoint, nextNextPoint);

  let bestIntersection: Point2D | null = null;
  let bestIntersectionDistanceSquared = Number.POSITIVE_INFINITY;

  previousCornerCandidates.forEach((previousCandidate) => {
    nextCornerCandidates.forEach((nextCandidate) => {
      const intersection = getRayIntersection(previousCandidate, nextCandidate);

      if (!intersection) {
        return;
      }

      const previousAngle = getCornerAngleDegrees(previousPreviousPoint, previousPoint, intersection);
      const nextAngle = getCornerAngleDegrees(intersection, nextPoint, nextNextPoint);

      if (
        previousAngle === null ||
        nextAngle === null ||
        Math.abs(previousAngle - previousCandidate.angle) > 0.25 ||
        Math.abs(nextAngle - nextCandidate.angle) > 0.25
      ) {
        return;
      }

      const intersectionDistanceSquared = getDistanceSquared(targetPoint, intersection);

      if (intersectionDistanceSquared < bestIntersectionDistanceSquared) {
        bestIntersection = intersection;
        bestIntersectionDistanceSquared = intersectionDistanceSquared;
      }
    });
  });

  if (bestIntersection) {
    return bestIntersection;
  }

  const previousCornerCandidate = previousCornerCandidates
    .map((candidate) => candidate.projectedPoint)
    .sort((left, right) => getDistanceSquared(targetPoint, left) - getDistanceSquared(targetPoint, right))[0] ?? null;
  const nextCornerCandidate = nextCornerCandidates
    .map((candidate) => candidate.projectedPoint)
    .sort((left, right) => getDistanceSquared(targetPoint, left) - getDistanceSquared(targetPoint, right))[0] ?? null;

  if (previousCornerCandidate && nextCornerCandidate) {
    return getDistanceSquared(targetPoint, previousCornerCandidate) <= getDistanceSquared(targetPoint, nextCornerCandidate)
      ? previousCornerCandidate
      : nextCornerCandidate;
  }

  return previousCornerCandidate ?? nextCornerCandidate ?? targetPoint;
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
  const [showDimensions, setShowDimensions] = useState(false);
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
  const shouldShowRoomDimensions = showDimensions || isRoomEditingEnabled;
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
            angle: roundAngleForDisplay(angle),
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
      let nextX = (event.clientX - roomRect.left) / displayZoom;
      let nextY = (event.clientY - roomRect.top) / displayZoom;

      if (event.shiftKey) {
        const previousPreviousIndex = (pointDragState.index - 2 + roomOutline.length) % roomOutline.length;
        const previousIndex = (pointDragState.index - 1 + roomOutline.length) % roomOutline.length;
        const nextIndex = (pointDragState.index + 1) % roomOutline.length;
        const nextNextIndex = (pointDragState.index + 2) % roomOutline.length;
        const snappedPoint = getSnappedPointFromAdjacentAngles(
          { x: nextX, y: nextY },
          roomOutline[previousPreviousIndex],
          roomOutline[previousIndex],
          roomOutline[nextIndex],
          roomOutline[nextNextIndex],
        );

        nextX = snappedPoint.x;
        nextY = snappedPoint.y;
      }

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
  }, [displayZoom, onRoomPointMove, pointDragState, roomOutline]);

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
        <button type="button" className={activeTool === 'memo' ? 'is-active' : ''} onClick={() => handleToolChange('memo')}>
          메모
        </button>
      </div>
      <div className="canvas-view-controls">
        <button
          type="button"
          className={`canvas-view-control ${showDimensions ? 'is-active' : ''}`}
          onClick={() => setShowDimensions((current) => !current)}
          aria-pressed={showDimensions}
          title="치수 표시"
        >
          <DimensionsIcon />
          <span>치수</span>
        </button>
        <div className="canvas-layer-control">
          <button
            type="button"
            className={`canvas-view-control ${isLayerPanelOpen ? 'is-active' : ''}`}
            onClick={() => setIsLayerPanelOpen((current) => !current)}
            aria-pressed={isLayerPanelOpen}
            title="레이어"
          >
            <LayersIcon />
            <span>레이어</span>
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
                showDimensions={showDimensions}
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
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={zoomIn}>+</button>
        <button type="button" onClick={resetViewport}>맞춤</button>
      </div>
      <div className="canvas-coordinates">
        X: {Math.round(focusX)}mm&nbsp;&nbsp;Y: {Math.round(focusY)}mm
      </div>
    </section>
  );
}
