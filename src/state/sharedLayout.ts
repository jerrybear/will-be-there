import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { HomeOrientationPreset, LayoutElementKind, LayoutNote, PlacedFurniture, Position, Room, RoomObstacle, SavedLayout, SavedRoom, SunlightProfile, SunlightSeason, SunlightTimeOfDay } from '../types/layout';
import { CURRENT_SCHEMA_VERSION, parseSavedLayoutsPayload, parseSavedRoomsPayload } from './layoutStorage';
import { normalizeSunlightProfile } from '../utils/solarPosition';

const SHARED_LAYOUT_HASH_KEY = 'share';
const SHARED_LAYOUT_PAYLOAD_TYPE = 'shared-layout';
const COMPACT_SHARED_LAYOUT_FORMAT = 1;

type CompactPoint = [string, number, number];
type CompactObstacleRect = ['r', string, string, number, number, number, number];
type CompactObstaclePolygon = ['p', string, string, CompactPoint[]];
type CompactObstacle = CompactObstacleRect | CompactObstaclePolygon;
type CompactItem = [string, string, string, string, LayoutElementKind, string, number, ...Array<string | number | boolean | undefined>];
type CompactNote = [string, number, number, string];
type CompactSunlightProfile = [SunlightProfile['mode'], string, number, number, HomeOrientationPreset, SunlightSeason, SunlightTimeOfDay, number?, number?];

interface CompactSharedLayoutPayload {
  f: typeof COMPACT_SHARED_LAYOUT_FORMAT;
  v: number;
  r: [
    string,
    string,
    string?,
    number?,
    number?,
    number?,
    CompactPoint[]?,
    CompactObstacle[]?,
  ];
  l: [
    string,
    string,
    string?,
    CompactItem[]?,
    CompactNote[]?,
    CompactSunlightProfile?,
  ];
}

export interface SharedLayoutPayload {
  type: typeof SHARED_LAYOUT_PAYLOAD_TYPE;
  schemaVersion: number;
  room: SavedRoom;
  layout: SavedLayout;
}

interface SharedLayoutLoadSuccess {
  payload: SharedLayoutPayload | null;
  error: null;
}

interface SharedLayoutLoadFailure {
  payload: null;
  error: string | null;
}

function canUseBrowserApis() {
  return typeof window !== 'undefined' && typeof window.location !== 'undefined';
}

function toBase64Url(value: string) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + padding);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function roundShareNumber(value: number) {
  return Number.isInteger(value) ? value : Math.round(value * 100) / 100;
}

function getCompactNumber(value: string | number | boolean | undefined, fallback = 0) {
  return typeof value === 'number' ? value : fallback;
}

function trimTrailingUndefined<T>(value: T[]) {
  const copy = [...value];

  while (copy.length > 0 && copy[copy.length - 1] === undefined) {
    copy.pop();
  }

  return copy;
}

function toCompactPoint(point: Position): CompactPoint {
  return [point.id ?? '', roundShareNumber(point.x), roundShareNumber(point.y)];
}

function fromCompactPoint(point: CompactPoint, fallbackId: string): Position {
  return {
    id: point[0] || fallbackId,
    x: point[1],
    y: point[2],
  };
}

function toCompactObstacle(obstacle: RoomObstacle): CompactObstacle {
  if (obstacle.type === 'polygon') {
    return ['p', obstacle.id, obstacle.label, obstacle.points.map(toCompactPoint)];
  }

  return [
    'r',
    obstacle.id,
    obstacle.label,
    roundShareNumber(obstacle.x),
    roundShareNumber(obstacle.y),
    roundShareNumber(obstacle.width),
    roundShareNumber(obstacle.height),
  ];
}

function fromCompactObstacle(obstacle: CompactObstacle, index: number): RoomObstacle {
  if (obstacle[0] === 'p') {
    return {
      id: obstacle[1] || `obstacle-${index}`,
      type: 'polygon',
      label: obstacle[2] || `장애물 ${index + 1}`,
      points: obstacle[3].map((point, pointIndex) => fromCompactPoint(point, `point-${index}-${pointIndex}`)),
    };
  }

  return {
    id: obstacle[1] || `obstacle-${index}`,
    type: 'rect',
    label: obstacle[2] || `장애물 ${index + 1}`,
    x: obstacle[3],
    y: obstacle[4],
    width: obstacle[5],
    height: obstacle[6],
  };
}

function toCompactItem(item: PlacedFurniture): CompactItem {
  return trimTrailingUndefined([
    item.id,
    item.templateId,
    item.label,
    item.color,
    item.kind,
    item.threeModel,
    roundShareNumber(item.objectHeight),
    item.elevation === 0 ? undefined : roundShareNumber(item.elevation),
    roundShareNumber(item.width),
    roundShareNumber(item.height),
    roundShareNumber(item.rotation),
    roundShareNumber(item.x),
    roundShareNumber(item.y),
    item.wallSegmentId,
    item.wallRotationOffset === 0 ? undefined : item.wallRotationOffset,
    item.isWallAttached ? true : undefined,
    item.doorHinge,
    item.doorSwingDir,
    item.showDoorSwing ? true : undefined,
    item.doorOpenAngle === undefined || item.doorOpenAngle === 90 ? undefined : roundShareNumber(item.doorOpenAngle),
  ]) as CompactItem;
}

function fromCompactItem(item: CompactItem): PlacedFurniture {
  return {
    id: item[0],
    templateId: item[1],
    label: item[2],
    color: item[3],
    kind: item[4],
    threeModel: item[5] as PlacedFurniture['threeModel'],
    objectHeight: getCompactNumber(item[6]),
    elevation: getCompactNumber(item[7]),
    width: getCompactNumber(item[8]),
    height: getCompactNumber(item[9]),
    rotation: getCompactNumber(item[10]),
    x: getCompactNumber(item[11]),
    y: getCompactNumber(item[12]),
    wallSegmentId: typeof item[13] === 'string' ? item[13] : undefined,
    wallRotationOffset: item[14] === 90 ? 90 : 0,
    isWallAttached: item[15] === true ? true : (item[4] === 'door' || item[4] === 'window'),
    doorHinge: item[16] === 'left' || item[16] === 'right' ? item[16] : undefined,
    doorSwingDir: item[17] === 'front' || item[17] === 'back' ? item[17] : undefined,
    showDoorSwing: item[18] === true,
    doorOpenAngle: typeof item[19] === 'number' ? item[19] : (item[4] === 'door' ? 90 : undefined),
  };
}

function toCompactNote(note: LayoutNote): CompactNote {
  return [note.id, roundShareNumber(note.x), roundShareNumber(note.y), note.text];
}

function fromCompactNote(note: CompactNote): LayoutNote {
  return {
    id: note[0],
    x: note[1],
    y: note[2],
    text: note[3],
  };
}

function toCompactSunlightProfile(profile: SunlightProfile): CompactSunlightProfile {
  const normalizedProfile = normalizeSunlightProfile(profile);

  return trimTrailingUndefined([
    normalizedProfile.mode,
    normalizedProfile.cityId,
    roundShareNumber(normalizedProfile.latitude),
    roundShareNumber(normalizedProfile.longitude),
    normalizedProfile.homeOrientationPreset,
    normalizedProfile.season,
    normalizedProfile.timeOfDay,
    normalizedProfile.customOrientationDegrees === undefined ? undefined : roundShareNumber(normalizedProfile.customOrientationDegrees),
    normalizedProfile.solarTimeMinutes === undefined ? undefined : roundShareNumber(normalizedProfile.solarTimeMinutes),
  ]) as CompactSunlightProfile;
}

function fromCompactSunlightProfile(profile: CompactSunlightProfile | undefined): SunlightProfile {
  if (!profile) {
    return normalizeSunlightProfile(undefined);
  }

  return normalizeSunlightProfile({
    mode: profile[0],
    cityId: profile[1],
    latitude: profile[2],
    longitude: profile[3],
    homeOrientationPreset: profile[4],
    season: profile[5],
    timeOfDay: profile[6],
    customOrientationDegrees: profile[7],
    solarTimeMinutes: profile[8],
  });
}

function isSharedLayoutPayload(value: unknown): value is SharedLayoutPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const draft = value as Partial<SharedLayoutPayload>;
  return draft.type === SHARED_LAYOUT_PAYLOAD_TYPE
    && typeof draft.schemaVersion === 'number'
    && !!draft.room
    && !!draft.layout;
}

function isCompactSharedLayoutPayload(value: unknown): value is CompactSharedLayoutPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const draft = value as Partial<CompactSharedLayoutPayload>;
  return draft.f === COMPACT_SHARED_LAYOUT_FORMAT
    && typeof draft.v === 'number'
    && Array.isArray(draft.r)
    && Array.isArray(draft.l);
}

function compactSharedLayoutPayload(payload: SharedLayoutPayload): CompactSharedLayoutPayload {
  return {
    f: COMPACT_SHARED_LAYOUT_FORMAT,
    v: payload.schemaVersion,
    r: trimTrailingUndefined([
      payload.room.id,
      payload.room.name,
      payload.room.memo || undefined,
      roundShareNumber(payload.room.room.width),
      roundShareNumber(payload.room.room.height),
      roundShareNumber(payload.room.room.wallHeight),
      payload.room.room.shape.points.map(toCompactPoint),
      payload.room.room.shape.obstacles.length > 0 ? payload.room.room.shape.obstacles.map(toCompactObstacle) : undefined,
    ]) as CompactSharedLayoutPayload['r'],
    l: trimTrailingUndefined([
      payload.layout.id,
      payload.layout.name,
      payload.layout.memo || undefined,
      payload.layout.items.map(toCompactItem),
      payload.layout.notes.length > 0 ? payload.layout.notes.map(toCompactNote) : undefined,
      toCompactSunlightProfile(payload.layout.sunlightProfile),
    ]) as CompactSharedLayoutPayload['l'],
  };
}

function expandCompactSharedLayoutPayload(payload: CompactSharedLayoutPayload): SharedLayoutPayload {
  const roomId = payload.r[0] || 'shared-room';
  const room: SavedRoom = {
    schemaVersion: payload.v,
    id: roomId,
    name: payload.r[1] || '공유 방',
    memo: payload.r[2] ?? '',
    room: {
      width: payload.r[3] ?? 0,
      height: payload.r[4] ?? 0,
      wallHeight: payload.r[5] ?? 2400,
      shape: {
        type: 'polygon',
        points: (payload.r[6] ?? []).map((point, index) => fromCompactPoint(point, `point-${index}`)),
        obstacles: (payload.r[7] ?? []).map(fromCompactObstacle),
      },
    },
    updatedAt: new Date(0).toISOString(),
  };
  const layout: SavedLayout = {
    schemaVersion: payload.v,
    id: payload.l[0] || 'shared-layout',
    roomId,
    name: payload.l[1] || '공유 도면',
    memo: payload.l[2] ?? '',
    items: (payload.l[3] ?? []).map(fromCompactItem),
    notes: (payload.l[4] ?? []).map(fromCompactNote),
    sunlightProfile: fromCompactSunlightProfile(payload.l[5]),
    updatedAt: new Date(0).toISOString(),
  };

  return {
    type: SHARED_LAYOUT_PAYLOAD_TYPE,
    schemaVersion: payload.v,
    room,
    layout,
  };
}

export function createSharedLayoutPayload(room: SavedRoom, layout: SavedLayout): SharedLayoutPayload {
  return {
    type: SHARED_LAYOUT_PAYLOAD_TYPE,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    room: {
      ...room,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
    layout: {
      ...layout,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      roomId: room.id,
    },
  };
}

export function serializeSharedLayoutPayload(payload: SharedLayoutPayload) {
  return compressToEncodedURIComponent(JSON.stringify(compactSharedLayoutPayload(payload)));
}

function migrateSharedLayoutPayload(payload: SharedLayoutPayload): SharedLayoutPayload {
  const rooms = parseSavedRoomsPayload(JSON.stringify([payload.room]));
  const workspaceState = parseSavedLayoutsPayload(JSON.stringify([payload.layout]), rooms);
  const room = workspaceState.rooms[0];
  const layout = workspaceState.layouts[0];

  if (!room || !layout) {
    throw new Error('공유 도면 데이터를 해석할 수 없습니다.');
  }

  return createSharedLayoutPayload(room, {
    ...layout,
    roomId: room.id,
  });
}

export function deserializeSharedLayoutPayload(encodedValue: string): SharedLayoutPayload {
  const compressedValue = decompressFromEncodedURIComponent(encodedValue);

  if (compressedValue) {
    const compactOrFullPayload = JSON.parse(compressedValue);

    if (isCompactSharedLayoutPayload(compactOrFullPayload)) {
      return migrateSharedLayoutPayload(expandCompactSharedLayoutPayload(compactOrFullPayload));
    }

    if (isSharedLayoutPayload(compactOrFullPayload)) {
      return migrateSharedLayoutPayload(compactOrFullPayload);
    }
  }

  const parsedValue = JSON.parse(fromBase64Url(encodedValue));

  if (!isSharedLayoutPayload(parsedValue)) {
    throw new Error('공유 링크 형식이 올바르지 않습니다.');
  }

  return migrateSharedLayoutPayload(parsedValue);
}

export function buildSharedLayoutUrl(payload: SharedLayoutPayload, baseUrl = typeof window !== 'undefined' ? window.location.href : 'http://localhost/') {
  const url = new URL(baseUrl);
  url.hash = `${SHARED_LAYOUT_HASH_KEY}=${serializeSharedLayoutPayload(payload)}`;
  return url.toString();
}

export function loadSharedLayoutFromHash(hash = canUseBrowserApis() ? window.location.hash : ''): SharedLayoutLoadSuccess | SharedLayoutLoadFailure {
  if (!hash) {
    return { payload: null, error: null };
  }

  const trimmedHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const hashParams = new URLSearchParams(trimmedHash);
  const encodedPayload = hashParams.get(SHARED_LAYOUT_HASH_KEY);

  if (!encodedPayload) {
    return { payload: null, error: null };
  }

  try {
    return {
      payload: deserializeSharedLayoutPayload(encodedPayload),
      error: null,
    };
  } catch (error) {
    return {
      payload: null,
      error: error instanceof Error ? error.message : '공유 링크를 불러오지 못했습니다.',
    };
  }
}

export function createShareSnapshot(payload: SharedLayoutPayload): { room: Room; items: SavedLayout['items']; notes: LayoutNote[]; sunlightProfile: SunlightProfile; roomName: string; layoutName: string } {
  return {
    room: payload.room.room,
    items: payload.layout.items,
    notes: payload.layout.notes,
    sunlightProfile: payload.layout.sunlightProfile,
    roomName: payload.room.name,
    layoutName: payload.layout.name,
  };
}
