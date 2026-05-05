import type { PlacedFurniture, Position, Room, RoomObstacle, RoomShape, RoomShapePreset, Size } from '../types/layout';
import { getRotatedSize } from '../types/layout';

export interface Rect extends Size, Position {}

export interface WallSegment {
  id: string;
  start: Position;
  end: Position;
}

export function createRectRoomShape(width: number, height: number): RoomShape {
  return {
    type: 'polygon',
    points: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    obstacles: [],
  };
}

export function createRoomShapeFromPreset(width: number, height: number, preset: RoomShapePreset, obstacles: RoomObstacle[] = []): RoomShape {
  if (preset === 'l-shape') {
    return {
      type: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: Math.round(height * 0.58) },
        { x: Math.round(width * 0.62), y: Math.round(height * 0.58) },
        { x: Math.round(width * 0.62), y: height },
        { x: 0, y: height },
      ],
      obstacles,
    };
  }

  if (preset === 'bay') {
    return {
      type: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: Math.round(width * 0.34), y: 0 },
        { x: Math.round(width * 0.34), y: Math.round(height * 0.14) },
        { x: Math.round(width * 0.68), y: Math.round(height * 0.14) },
        { x: Math.round(width * 0.68), y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ],
      obstacles,
    };
  }

  if (preset === 'diagonal') {
    return {
      type: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: Math.round(width * 0.18), y: height },
        { x: 0, y: Math.round(height * 0.72) },
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
    id: `wall-${index}`,
    start: point,
    end: points[(index + 1) % points.length],
  }));
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

  return dotProduct <= squaredLength;
}

export function pointInPolygon(point: Position, polygon: Position[]) {
  let isInside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i) {
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
