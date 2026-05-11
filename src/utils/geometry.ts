import type { PlacedFurniture, Position, Room, RoomObstacle, RoomShape, RoomShapePreset, Size } from '../types/layout';
import { getRotatedSize } from '../types/layout';

export interface Rect extends Size, Position {}
export const DEFAULT_WALL_HEIGHT = 2400;

export interface WallSegment {
  id: string;
  start: Position;
  end: Position;
}

function createPoint(id: string, x: number, y: number): Position {
  return { id, x, y };
}

export function createRectRoomShape(width: number, height: number): RoomShape {
  return {
    type: 'polygon',
    points: [
      createPoint('point-0', 0, 0),
      createPoint('point-1', width, 0),
      createPoint('point-2', width, height),
      createPoint('point-3', 0, height),
    ],
    obstacles: [],
  };
}

export function createRoomShapeFromPreset(width: number, height: number, preset: RoomShapePreset, obstacles: RoomObstacle[] = []): RoomShape {
  if (preset === 'l-shape') {
    return {
      type: 'polygon',
      points: [
        createPoint('point-0', 0, 0),
        createPoint('point-1', width, 0),
        createPoint('point-2', width, Math.round(height * 0.58)),
        createPoint('point-3', Math.round(width * 0.62), Math.round(height * 0.58)),
        createPoint('point-4', Math.round(width * 0.62), height),
        createPoint('point-5', 0, height),
      ],
      obstacles,
    };
  }

  if (preset === 'bay') {
    return {
      type: 'polygon',
      points: [
        createPoint('point-0', 0, 0),
        createPoint('point-1', Math.round(width * 0.34), 0),
        createPoint('point-2', Math.round(width * 0.34), Math.round(height * 0.14)),
        createPoint('point-3', Math.round(width * 0.68), Math.round(height * 0.14)),
        createPoint('point-4', Math.round(width * 0.68), 0),
        createPoint('point-5', width, 0),
        createPoint('point-6', width, height),
        createPoint('point-7', 0, height),
      ],
      obstacles,
    };
  }

  if (preset === 'diagonal') {
    return {
      type: 'polygon',
      points: [
        createPoint('point-0', 0, 0),
        createPoint('point-1', width, 0),
        createPoint('point-2', width, height),
        createPoint('point-3', Math.round(width * 0.18), height),
        createPoint('point-4', 0, Math.round(height * 0.72)),
      ],
      obstacles,
    };
  }

  return {
    ...createRectRoomShape(width, height),
    obstacles,
  };
}

export function createRectRoom(width: number, height: number): Room {
  return {
    width,
    height,
    wallHeight: DEFAULT_WALL_HEIGHT,
    shape: createRectRoomShape(width, height),
  };
}

export function getRoomShape(room: Room): RoomShape {
  return room.shape ?? createRectRoomShape(room.width, room.height);
}

export function getRoomOutlinePoints(room: Room): Position[] {
  return getRoomShape(room).points;
}

export function getRoomWallSegments(room: Room): WallSegment[] {
  const points = getRoomOutlinePoints(room);

  return points.map((point, index) => ({
    id: `${point.id ?? `point-${index}`}-${points[(index + 1) % points.length].id ?? `point-${(index + 1) % points.length}`}`,
    start: point,
    end: points[(index + 1) % points.length],
  }));
}

export function normalizeRoomShapePointIds(shape: RoomShape): RoomShape {
  return {
    ...shape,
    points: shape.points.map((point, index) => ({
      ...point,
      id: point.id ?? `point-${index}`,
    })),
  };
}

export function getSegmentAngle(segment: Pick<WallSegment, 'start' | 'end'>) {
  return Math.atan2(segment.end.y - segment.start.y, segment.end.x - segment.start.x) * 180 / Math.PI;
}

export function normalizeRotation(value: number): number {
  return Math.round(((value % 360) + 360) % 360);
}

function getDistanceSquared(a: Position, b: Position) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

export function projectPointToSegment(point: Position, segment: Pick<WallSegment, 'start' | 'end'>): Position {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSquared = dx ** 2 + dy ** 2;

  if (lengthSquared === 0) {
    return segment.start;
  }

  const t = Math.max(0, Math.min(1, ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSquared));

  return {
    x: segment.start.x + t * dx,
    y: segment.start.y + t * dy,
  };
}

export function getNearestWallProjection(room: Room, point: Position) {
  return getRoomWallSegments(room).reduce((nearest, segment) => {
    const projection = projectPointToSegment(point, segment);
    const distance = getDistanceSquared(point, projection);

    if (!nearest || distance < nearest.distance) {
      return {
        segment,
        projection,
        distance,
      };
    }

    return nearest;
  }, null as null | { segment: WallSegment; projection: Position; distance: number });
}

export function getSvgPoints(points: Position[]) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

export function rectFromItem(item: PlacedFurniture): Rect {
  const footprint = getRotatedSize(item);

  return {
    x: item.x,
    y: item.y,
    width: footprint.width,
    height: footprint.height,
  };
}

export function rectsOverlap(a: Rect, b: Rect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function pointOnSegment(point: Position, start: Position, end: Position) {
  const crossProduct = (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);

  if (Math.abs(crossProduct) > 0.001) {
    return false;
  }

  const dotProduct = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);

  if (dotProduct < 0) {
    return false;
  }

  const squaredLength = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;

  if (squaredLength === 0) {
    return Math.abs(point.x - start.x) < 0.001 && Math.abs(point.y - start.y) < 0.001;
  }

  return dotProduct <= squaredLength;
}

export function pointInPolygon(point: Position, polygon: Position[]) {
  let isInside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const current = polygon[i];
    const previous = polygon[j];

    if (pointOnSegment(point, previous, current)) {
      return true;
    }

    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;

    if (intersects) {
      isInside = !isInside;
    }
  }

  return isInside;
}

function rectCorners(rect: Rect): Position[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

function obstacleToRects(obstacle: RoomObstacle): Rect[] {
  if (obstacle.type === 'rect') {
    return [obstacle];
  }

  return [];
}

export function isRectInsideRoom(room: Room, rect: Rect) {
  const shape = getRoomShape(room);
  const isInsideOuter = rectCorners(rect).every((corner) => pointInPolygon(corner, shape.points));

  if (!isInsideOuter) {
    return false;
  }

  return shape.obstacles.every((obstacle) => {
    const obstacleRects = obstacleToRects(obstacle);
    return obstacleRects.every((obstacleRect) => !rectsOverlap(rect, obstacleRect));
  });
}

export function getItemPlacementRect(item: Pick<PlacedFurniture, 'width' | 'height' | 'rotation'>, x: number, y: number): Rect {
  const footprint = getRotatedSize(item);

  return {
    x,
    y,
    width: footprint.width,
    height: footprint.height,
  };
}

function cross(o: Position, a: Position, b: Position) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function onSegmentCollinear(p: Position, q: Position, r: Position) {
  return (
    Math.min(p.x, r.x) <= q.x + 0.001 &&
    q.x - 0.001 <= Math.max(p.x, r.x) &&
    Math.min(p.y, r.y) <= q.y + 0.001 &&
    q.y - 0.001 <= Math.max(p.y, r.y)
  );
}

/**
 * Tests whether line segment AB properly intersects line segment CD.
 * Shared endpoints are NOT considered intersections (adjacent edges).
 */
export function segmentsIntersect(a: Position, b: Position, c: Position, d: Position): boolean {
  // Skip if segments share an endpoint
  if ((a.x === c.x && a.y === c.y) || (a.x === d.x && a.y === d.y) ||
      (b.x === c.x && b.y === c.y) || (b.x === d.x && b.y === d.y)) {
    return false;
  }

  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  if (Math.abs(d1) < 0.001 && onSegmentCollinear(c, a, d)) return true;
  if (Math.abs(d2) < 0.001 && onSegmentCollinear(c, b, d)) return true;
  if (Math.abs(d3) < 0.001 && onSegmentCollinear(a, c, b)) return true;
  if (Math.abs(d4) < 0.001 && onSegmentCollinear(a, d, b)) return true;

  return false;
}

/**
 * Returns true if the polygon defined by `points` has any self-intersection
 * (two non-adjacent edges crossing each other).
 */
export function hasPolygonSelfIntersection(points: Position[]): boolean {
  const n = points.length;

  if (n < 4) {
    return false;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      // Skip adjacent edges (i and j share a vertex when j === i+1, or i===0 && j===n-1)
      if (i === 0 && j === n - 1) {
        continue;
      }

      if (
        segmentsIntersect(
          points[i],
          points[(i + 1) % n],
          points[j],
          points[(j + 1) % n],
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Projects a PlacedFurniture item's center onto a wall segment and returns
 * the distance along the wall from the segment's start point.
 */
export function projectItemToWallLocal(
  segment: WallSegment,
  item: Pick<PlacedFurniture, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
): number {
  const placementRect = getItemPlacementRect(item, item.x, item.y);
  const centerX = placementRect.x + placementRect.width / 2;
  const centerY = placementRect.y + placementRect.height / 2;
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const segmentLength = Math.hypot(dx, dy);

  if (segmentLength === 0) {
    return 0;
  }

  const t = ((centerX - segment.start.x) * dx + (centerY - segment.start.y) * dy) / (segmentLength * segmentLength);

  return Math.max(0, Math.min(segmentLength, t * segmentLength));
}
