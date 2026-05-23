import { defaultKoreanCity } from '../data/koreanCities';
import type { HomeOrientationPreset, SunlightProfile, SunlightSeason, SunlightTimeOfDay } from '../types/layout';

export const homeOrientationDegreesByPreset: Record<Exclude<HomeOrientationPreset, 'custom'>, number> = {
  N: 0,
  NNE: 22.5,
  NE: 45,
  ENE: 67.5,
  E: 90,
  ESE: 112.5,
  SE: 135,
  SSE: 157.5,
  S: 180,
  SSW: 202.5,
  SW: 225,
  WSW: 247.5,
  W: 270,
  WNW: 292.5,
  NW: 315,
  NNW: 337.5,
};

export const homeOrientationLabels: Record<HomeOrientationPreset, string> = {
  N: '북',
  NNE: '북북동',
  NE: '북동',
  ENE: '동북동',
  E: '동',
  ESE: '동남동',
  SE: '남동',
  SSE: '남남동',
  S: '남',
  SSW: '남남서',
  SW: '남서',
  WSW: '서남서',
  W: '서',
  WNW: '서북서',
  NW: '북서',
  NNW: '북북서',
  custom: '직접 입력',
};

export const orientationPresets = Object.keys(homeOrientationDegreesByPreset) as Array<Exclude<HomeOrientationPreset, 'custom'>>;

const seasonDates: Record<SunlightSeason, { month: number; day: number }> = {
  spring: { month: 3, day: 20 },
  summer: { month: 6, day: 21 },
  autumn: { month: 9, day: 23 },
  winter: { month: 12, day: 21 },
};

const timeRatios: Record<SunlightTimeOfDay, number> = {
  sunrise: 0,
  morning: 0.25,
  noon: 0.5,
  afternoon: 0.75,
  sunset: 1,
};

export const defaultSunlightProfile: SunlightProfile = {
  mode: 'realistic',
  cityId: defaultKoreanCity.id,
  latitude: defaultKoreanCity.latitude,
  longitude: defaultKoreanCity.longitude,
  homeOrientationPreset: 'S',
  season: 'spring',
  timeOfDay: 'noon',
};

export interface SolarLightingResult {
  sunAzimuthDegrees: number;
  sunElevationDegrees: number;
  sceneAzimuthDegrees: number;
  intensity: number;
  ambientIntensity: number;
  color: number;
  localTimeMinutes: number;
  sunriseMinutes: number;
  sunsetMinutes: number;
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function toDegrees(value: number) {
  return value * 180 / Math.PI;
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getDayOfYear(season: SunlightSeason) {
  const date = seasonDates[season];
  const utcDate = Date.UTC(2026, date.month - 1, date.day);
  const yearStart = Date.UTC(2026, 0, 0);
  return Math.floor((utcDate - yearStart) / 86_400_000);
}

function getSolarTerms(dayOfYear: number, localHour: number) {
  const fractionalYear = 2 * Math.PI / 365 * (dayOfYear - 1 + (localHour - 12) / 24);
  const equationOfTime = 229.18 * (
    0.000075
    + 0.001868 * Math.cos(fractionalYear)
    - 0.032077 * Math.sin(fractionalYear)
    - 0.014615 * Math.cos(2 * fractionalYear)
    - 0.040849 * Math.sin(2 * fractionalYear)
  );
  const declination = (
    0.006918
    - 0.399912 * Math.cos(fractionalYear)
    + 0.070257 * Math.sin(fractionalYear)
    - 0.006758 * Math.cos(2 * fractionalYear)
    + 0.000907 * Math.sin(2 * fractionalYear)
    - 0.002697 * Math.cos(3 * fractionalYear)
    + 0.00148 * Math.sin(3 * fractionalYear)
  );

  return { equationOfTime, declination };
}

export function formatSolarTime(minutes: number) {
  const normalizedMinutes = Math.round(minutes);
  const hour = Math.floor(normalizedMinutes / 60);
  const minute = normalizedMinutes % 60;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function getSeasonalSunWindow(profileValue: Pick<SunlightProfile, 'latitude' | 'longitude' | 'season'>) {
  const profile = normalizeSunlightProfile(profileValue);
  const dayOfYear = getDayOfYear(profile.season);
  const { equationOfTime, declination } = getSolarTerms(dayOfYear, 12);
  const latitude = toRadians(profile.latitude);
  const zenith = toRadians(90.833);
  const cosHourAngle = clamp(
    (Math.cos(zenith) / (Math.cos(latitude) * Math.cos(declination))) - Math.tan(latitude) * Math.tan(declination),
    -1,
    1,
  );
  const hourAngle = toDegrees(Math.acos(cosHourAngle));
  const solarNoon = 720 - 4 * profile.longitude - equationOfTime + 9 * 60;
  const sunriseMinutes = clamp(solarNoon - hourAngle * 4, 0, 1439);
  const sunsetMinutes = clamp(solarNoon + hourAngle * 4, sunriseMinutes + 1, 1439);

  return {
    sunriseMinutes,
    sunsetMinutes,
    solarNoonMinutes: solarNoon,
  };
}

export function getTimeRatioFromMinutes(minutes: number, sunriseMinutes: number, sunsetMinutes: number) {
  return clamp((minutes - sunriseMinutes) / (sunsetMinutes - sunriseMinutes), 0, 1);
}

export function resolveSolarTimeMinutes(profileValue: SunlightProfile) {
  const profile = normalizeSunlightProfile(profileValue);
  const sunWindow = getSeasonalSunWindow(profile);

  if (typeof profile.solarTimeMinutes === 'number' && Number.isFinite(profile.solarTimeMinutes)) {
    return clamp(Math.round(profile.solarTimeMinutes), Math.round(sunWindow.sunriseMinutes), Math.round(sunWindow.sunsetMinutes));
  }

  return Math.round(sunWindow.sunriseMinutes + (sunWindow.sunsetMinutes - sunWindow.sunriseMinutes) * timeRatios[profile.timeOfDay]);
}

export function getHomeOrientationDegrees(profile: Pick<SunlightProfile, 'homeOrientationPreset' | 'customOrientationDegrees'>) {
  if (profile.homeOrientationPreset === 'custom') {
    return normalizeDegrees(Number.isFinite(profile.customOrientationDegrees) ? profile.customOrientationDegrees ?? 0 : 0);
  }

  return homeOrientationDegreesByPreset[profile.homeOrientationPreset];
}

export function normalizeSunlightProfile(profile: Partial<SunlightProfile> | undefined): SunlightProfile {
  const merged = {
    ...defaultSunlightProfile,
    ...profile,
  };

  return {
    ...merged,
    mode: merged.mode === 'manual' ? 'manual' : 'realistic',
    latitude: Number.isFinite(merged.latitude) ? merged.latitude : defaultSunlightProfile.latitude,
    longitude: Number.isFinite(merged.longitude) ? merged.longitude : defaultSunlightProfile.longitude,
    homeOrientationPreset: merged.homeOrientationPreset in homeOrientationLabels ? merged.homeOrientationPreset : 'S',
    customOrientationDegrees: merged.customOrientationDegrees === undefined
      ? undefined
      : normalizeDegrees(merged.customOrientationDegrees),
    season: ['spring', 'summer', 'autumn', 'winter'].includes(merged.season) ? merged.season : 'spring',
    timeOfDay: ['sunrise', 'morning', 'noon', 'afternoon', 'sunset'].includes(merged.timeOfDay) ? merged.timeOfDay : 'noon',
    solarTimeMinutes: typeof merged.solarTimeMinutes === 'number' && Number.isFinite(merged.solarTimeMinutes)
      ? clamp(Math.round(merged.solarTimeMinutes), 0, 1439)
      : undefined,
  };
}

export function calculateSolarLighting(profileValue: SunlightProfile): SolarLightingResult {
  const profile = normalizeSunlightProfile(profileValue);
  const dayOfYear = getDayOfYear(profile.season);
  const sunWindow = getSeasonalSunWindow(profile);
  const localTimeMinutes = resolveSolarTimeMinutes(profile);
  const localHour = localTimeMinutes / 60;
  const { equationOfTime, declination } = getSolarTerms(dayOfYear, localHour);
  const timeOffset = equationOfTime + 4 * profile.longitude + 9 * -60;
  const trueSolarTime = localHour * 60 + timeOffset;
  const hourAngle = toRadians(trueSolarTime / 4 - 180);
  const latitude = toRadians(profile.latitude);
  const cosZenith = clamp(
    Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle),
    -1,
    1,
  );
  const zenith = Math.acos(cosZenith);
  const elevation = Math.max(0, 90 - toDegrees(zenith));
  const azimuthRadians = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude),
  );
  const sunAzimuthDegrees = normalizeDegrees(toDegrees(azimuthRadians) + 180);
  const sceneAzimuthDegrees = normalizeDegrees(sunAzimuthDegrees - getHomeOrientationDegrees(profile));
  const lowSunFactor = clamp(elevation / 55, 0, 1);
  const timeRatio = getTimeRatioFromMinutes(localTimeMinutes, sunWindow.sunriseMinutes, sunWindow.sunsetMinutes);
  const timeFactor = timeRatio < 0.08 || timeRatio > 0.92 ? 0.72 : 1;
  const intensity = 0.35 + lowSunFactor * 1.65 * timeFactor;
  const ambientIntensity = 0.48 + lowSunFactor * 0.32;
  const color = timeRatio < 0.12 || timeRatio > 0.88
    ? 0xffd4a3
    : profile.season === 'winter'
      ? 0xf4f8ff
      : 0xffffff;

  return {
    sunAzimuthDegrees,
    sunElevationDegrees: elevation,
    sceneAzimuthDegrees,
    intensity,
    ambientIntensity,
    color,
    localTimeMinutes,
    sunriseMinutes: sunWindow.sunriseMinutes,
    sunsetMinutes: sunWindow.sunsetMinutes,
  };
}
