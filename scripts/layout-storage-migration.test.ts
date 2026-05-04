import {
  CURRENT_SCHEMA_VERSION,
  createStoredLayoutsPayload,
  parseSavedLayoutsPayload,
} from '../src/state/layoutStorage';

function assertEqual<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

const legacyArrayPayload = JSON.stringify([
  {
    id: 'layout-legacy-array',
    name: 'legacy array',
    room: { width: 720, height: 480 },
    items: [
      {
        id: 'furniture-1',
        templateId: 'window',
        label: '창문',
        color: '#bae6fd',
        width: 120,
        height: 16,
        rotation: 0,
        x: 24,
        y: 0,
      },
    ],
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
]);

const legacyObjectPayload = JSON.stringify({
  schemaVersion: 2,
  layouts: [
    {
      id: 'layout-legacy-object',
      name: 'legacy object',
      memo: 'old memo',
      room: { width: 640, height: 420 },
      items: [
        {
          id: 'furniture-2',
          templateId: 'door',
          label: '문',
          color: '#f8c291',
          width: 84,
          height: 18,
          rotation: 90,
          x: 0,
          y: 120,
        },
      ],
      updatedAt: '2026-05-02T00:00:00.000Z',
    },
  ],
});

const [arrayLayout] = parseSavedLayoutsPayload(legacyArrayPayload);

assertEqual(arrayLayout.schemaVersion, CURRENT_SCHEMA_VERSION);
assertEqual(arrayLayout.memo, '');
assertEqual(arrayLayout.items[0].kind, 'window');
assertEqual(arrayLayout.items[0].objectHeight, 100);
assertEqual(arrayLayout.items[0].elevation, 90);
assertEqual(arrayLayout.items[0].isWallAttached, true);

const [objectLayout] = parseSavedLayoutsPayload(legacyObjectPayload);

assertEqual(objectLayout.schemaVersion, CURRENT_SCHEMA_VERSION);
assertEqual(objectLayout.memo, 'old memo');
assertEqual(objectLayout.items[0].kind, 'door');
assertEqual(objectLayout.items[0].objectHeight, 210);
assertEqual(objectLayout.items[0].elevation, 0);
assertEqual(objectLayout.items[0].isWallAttached, true);

const persistedPayload = createStoredLayoutsPayload([arrayLayout, objectLayout]);

assertEqual(persistedPayload.schemaVersion, CURRENT_SCHEMA_VERSION);
assertEqual(persistedPayload.layouts.length, 2);
assertEqual(persistedPayload.layouts[0].schemaVersion, CURRENT_SCHEMA_VERSION);
