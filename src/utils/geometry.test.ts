import { describe, it, expect } from 'vitest';
import { 
  pointInPolygon, 
  rectsOverlap, 
  isRectInsideRoom, 
  createRectRoom,
  createRectRoomShape,
  projectPointToSegment,
  projectItemToWallLocal,
  segmentsIntersect,
  hasPolygonSelfIntersection
} from './geometry';
import type { Rect } from './geometry';
import type { Position, Room } from '../types/layout';

describe('geometry utilities', () => {
  describe('pointInPolygon', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    it('should return true for a point inside the polygon', () => {
      expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
    });

    it('should return true for a point on the edge', () => {
      expect(pointInPolygon({ x: 0, y: 50 }, square)).toBe(true);
      expect(pointInPolygon({ x: 100, y: 50 }, square)).toBe(true);
    });

    it('should return false for a point outside the polygon', () => {
      expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
      expect(pointInPolygon({ x: -10, y: 50 }, square)).toBe(false);
    });

    it('should work with L-shaped polygons', () => {
      const lShape = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 50, y: 50 },
        { x: 50, y: 100 },
        { x: 0, y: 100 },
      ];
      expect(pointInPolygon({ x: 25, y: 25 }, lShape)).toBe(true);
      expect(pointInPolygon({ x: 75, y: 75 }, lShape)).toBe(false);
    });
  });

  describe('rectsOverlap', () => {
    it('should return true when rectangles overlap', () => {
      const rect1: Rect = { x: 0, y: 0, width: 100, height: 100 };
      const rect2: Rect = { x: 50, y: 50, width: 100, height: 100 };
      expect(rectsOverlap(rect1, rect2)).toBe(true);
    });

    it('should return false when rectangles do not overlap', () => {
      const rect1: Rect = { x: 0, y: 0, width: 50, height: 50 };
      const rect2: Rect = { x: 100, y: 100, width: 50, height: 50 };
      expect(rectsOverlap(rect1, rect2)).toBe(false);
    });

    it('should return false when rectangles only touch edges', () => {
      const rect1: Rect = { x: 0, y: 0, width: 100, height: 100 };
      const rect2: Rect = { x: 100, y: 0, width: 100, height: 100 };
      expect(rectsOverlap(rect1, rect2)).toBe(false);
    });
  });

  describe('isRectInsideRoom', () => {
    const room: Room = createRectRoom(500, 500);

    it('should return true for a rect fully inside the room', () => {
      const rect: Rect = { x: 100, y: 100, width: 50, height: 50 };
      expect(isRectInsideRoom(room, rect)).toBe(true);
    });

    it('should return false for a rect partially outside the room', () => {
      const rect: Rect = { x: 480, y: 100, width: 50, height: 50 };
      expect(isRectInsideRoom(room, rect)).toBe(false);
    });

    it('should return false for a rect inside an obstacle', () => {
      const roomWithObstacle: Room = {
        ...room,
        shape: {
          ...createRectRoomShape(500, 500),
          obstacles: [
            { id: 'obs-1', type: 'rect', x: 200, y: 200, width: 100, height: 100, label: 'Pillar' }
          ]
        }
      };
      const rectOverlap: Rect = { x: 250, y: 250, width: 20, height: 20 };
      expect(isRectInsideRoom(roomWithObstacle, rectOverlap)).toBe(false);
    });
  });

  describe('projectPointToSegment', () => {
    const segment = {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 }
    };

    it('should project point onto the segment', () => {
      const point: Position = { x: 50, y: 50 };
      const projection = projectPointToSegment(point, segment);
      expect(projection).toEqual({ x: 50, y: 0 });
    });

    it('should clamp to start point if projection is before start', () => {
      const point: Position = { x: -50, y: 50 };
      const projection = projectPointToSegment(point, segment);
      expect(projection).toEqual({ x: 0, y: 0 });
    });

    it('should clamp to end point if projection is after end', () => {
      const point: Position = { x: 150, y: 50 };
      const projection = projectPointToSegment(point, segment);
      expect(projection).toEqual({ x: 100, y: 0 });
    });
  });

  describe('projectItemToWallLocal', () => {
    const segment = {
      id: 'wall-1',
      start: { x: 0, y: 0 },
      end: { x: 200, y: 0 },
    };

    it('should use the rotated footprint center for wall-local projection', () => {
      const item = {
        x: 40,
        y: 0,
        width: 20,
        height: 80,
        rotation: 90,
      };

      expect(projectItemToWallLocal(segment, item)).toBe(80);
    });
  });

  describe('segmentsIntersect', () => {
    it('should return true for intersecting segments', () => {
      const a = { x: 0, y: 0 };
      const b = { x: 100, y: 100 };
      const c = { x: 0, y: 100 };
      const d = { x: 100, y: 0 };
      expect(segmentsIntersect(a, b, c, d)).toBe(true);
    });

    it('should return false for non-intersecting segments', () => {
      const a = { x: 0, y: 0 };
      const b = { x: 10, y: 10 };
      const c = { x: 50, y: 50 };
      const d = { x: 60, y: 60 };
      expect(segmentsIntersect(a, b, c, d)).toBe(false);
    });

    it('should return false for segments sharing an endpoint', () => {
      const a = { x: 0, y: 0 };
      const b = { x: 100, y: 100 };
      const c = { x: 100, y: 100 };
      const d = { x: 200, y: 100 };
      expect(segmentsIntersect(a, b, c, d)).toBe(false);
    });
  });

  describe('hasPolygonSelfIntersection', () => {
    it('should return true for self-intersecting polygon (hourglass)', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
        { x: 100, y: 0 },
      ];
      expect(hasPolygonSelfIntersection(points)).toBe(true);
    });

    it('should return false for simple convex polygon', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      expect(hasPolygonSelfIntersection(points)).toBe(false);
    });

    it('should return false for simple concave polygon', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 50, y: 50 },
        { x: 0, y: 100 },
      ];
      expect(hasPolygonSelfIntersection(points)).toBe(false);
    });
  });
});
