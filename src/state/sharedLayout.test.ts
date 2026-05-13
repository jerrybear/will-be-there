import { describe, expect, it } from 'vitest';
import type { SavedLayout, SavedRoom } from '../types/layout';
import { createRectRoom } from '../utils/geometry';
import { CURRENT_SCHEMA_VERSION } from './layoutStorage';
import { buildSharedLayoutUrl, createSharedLayoutPayload, deserializeSharedLayoutPayload, loadSharedLayoutFromHash, serializeSharedLayoutPayload } from './sharedLayout';

function createFixtureRoom(): SavedRoom {
  const room = createRectRoom(7200, 4800);

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'room-shared',
    name: '안방',
    memo: '붙박이장 있음',
    room: {
      ...room,
      shape: {
        ...room.shape,
        obstacles: [
          { id: 'obstacle-1', type: 'rect', label: '기둥', x: 300, y: 400, width: 220, height: 180 },
        ],
      },
    },
    updatedAt: '2026-05-13T09:00:00.000Z',
  };
}

function createFixtureLayout(roomId: string): SavedLayout {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'layout-shared',
    roomId,
    name: '침대 배치안 A',
    memo: '창문 피해서 배치',
    items: [
      {
        id: 'furniture-1',
        templateId: 'bed',
        label: '침대',
        color: '#cbd5f5',
        kind: 'furniture',
        threeModel: 'bed_frame',
        objectHeight: 480,
        elevation: 0,
        rotation: 90,
        x: 1200,
        y: 900,
        width: 1500,
        height: 2100,
      },
      {
        id: 'door-1',
        templateId: 'door',
        label: '방문',
        color: '#f8c291',
        kind: 'door',
        threeModel: 'box',
        objectHeight: 2100,
        elevation: 0,
        rotation: 0,
        x: 0,
        y: 600,
        width: 900,
        height: 70,
        isWallAttached: true,
        wallRotationOffset: 0,
        doorHinge: 'right',
        doorSwingDir: 'front',
        showDoorSwing: true,
        doorOpenAngle: 75,
      },
    ],
    notes: [
      { id: 'note-1', x: 1600, y: 700, text: '통로 확보 필요' },
    ],
    updatedAt: '2026-05-13T09:00:00.000Z',
  };
}

describe('sharedLayout', () => {
  it('round-trips a shared room and layout payload', () => {
    const room = createFixtureRoom();
    const layout = createFixtureLayout(room.id);
    const url = buildSharedLayoutUrl(createSharedLayoutPayload(room, layout), 'https://example.com/layout');
    const hash = new URL(url).hash;
    const result = loadSharedLayoutFromHash(hash);

    expect(result.error).toBeNull();
    expect(result.payload?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.payload?.room.name).toBe(room.name);
    expect(result.payload?.layout.name).toBe(layout.name);
    expect(result.payload?.layout.items[1].doorHinge).toBe('right');
    expect(result.payload?.room.room.shape.obstacles).toHaveLength(1);
    expect(result.payload?.layout.notes[0].text).toBe('통로 확보 필요');
  });

  it('migrates older schema payloads on decode', () => {
    const room = createFixtureRoom();
    const layout = createFixtureLayout(room.id);
    const payload = {
      type: 'shared-layout' as const,
      schemaVersion: 3,
      room: {
        ...room,
        schemaVersion: 3,
      },
      layout: {
        ...layout,
        schemaVersion: 3,
      },
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const decoded = deserializeSharedLayoutPayload(encoded);

    expect(decoded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(decoded.room.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(decoded.layout.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('produces a shorter encoded payload than the legacy base64 json share', () => {
    const payload = createSharedLayoutPayload(createFixtureRoom(), createFixtureLayout('room-shared'));
    const legacyEncoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const encoded = serializeSharedLayoutPayload(payload);

    expect(encoded.length).toBeLessThan(legacyEncoded.length);
  });

  it('returns a safe error for invalid payloads', () => {
    const result = loadSharedLayoutFromHash('#share=not-a-valid-payload');

    expect(result.payload).toBeNull();
    expect(result.error).toBeTruthy();
  });
});
