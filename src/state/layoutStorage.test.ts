import { describe, expect, it } from 'vitest';
import { parseSavedLayoutsPayload } from './layoutStorage';
import { defaultSunlightProfile } from '../utils/solarPosition';

describe('layoutStorage door migration', () => {
  it('fills missing door swing defaults for legacy layouts', () => {
    const payload = JSON.stringify([
      {
        id: 'layout-1',
        roomId: 'room-1',
        name: '테스트',
        updatedAt: '2026-05-12T00:00:00.000Z',
        items: [
          {
            id: 'door-1',
            templateId: 'door',
            label: '방문',
            color: '#ffffff',
            width: 900,
            height: 70,
            objectHeight: 2100,
            elevation: 0,
            rotation: 0,
            x: 0,
            y: 0,
          },
        ],
      },
    ]);

    const state = parseSavedLayoutsPayload(payload);
    const migratedDoor = state.layouts[0]?.items[0];

    expect(migratedDoor?.kind).toBe('door');
    expect(migratedDoor?.doorHinge).toBe('left');
    expect(migratedDoor?.doorSwingDir).toBe('front');
    expect(migratedDoor?.doorOpenAngle).toBe(90);
    expect(state.layouts[0]?.sunlightProfile).toEqual(defaultSunlightProfile);
  });
});
