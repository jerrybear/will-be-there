import { describe, expect, it } from 'vitest';
import {
  calculateSolarLighting,
  defaultSunlightProfile,
  formatSolarTime,
  getSeasonalSunWindow,
  getHomeOrientationDegrees,
  homeOrientationDegreesByPreset,
  normalizeSunlightProfile,
  resolveSolarTimeMinutes,
} from './solarPosition';

describe('solarPosition', () => {
  it('maps 16-point home orientation presets to degrees', () => {
    expect(homeOrientationDegreesByPreset.NNE).toBe(22.5);
    expect(homeOrientationDegreesByPreset.S).toBe(180);
    expect(homeOrientationDegreesByPreset.WNW).toBe(292.5);
  });

  it('keeps summer noon higher than winter noon in Seoul', () => {
    const summer = calculateSolarLighting({
      ...defaultSunlightProfile,
      season: 'summer',
      timeOfDay: 'noon',
    });
    const winter = calculateSolarLighting({
      ...defaultSunlightProfile,
      season: 'winter',
      timeOfDay: 'noon',
    });

    expect(summer.sunElevationDegrees).toBeGreaterThan(winter.sunElevationDegrees);
  });

  it('keeps sunrise and sunset lower and dimmer than noon', () => {
    const sunrise = calculateSolarLighting({
      ...defaultSunlightProfile,
      timeOfDay: 'sunrise',
    });
    const noon = calculateSolarLighting({
      ...defaultSunlightProfile,
      timeOfDay: 'noon',
    });

    expect(sunrise.sunElevationDegrees).toBeLessThan(noon.sunElevationDegrees);
    expect(sunrise.intensity).toBeLessThan(noon.intensity);
  });

  it('uses a longer seasonal daylight window in summer than winter', () => {
    const summer = getSeasonalSunWindow({
      ...defaultSunlightProfile,
      season: 'summer',
    });
    const winter = getSeasonalSunWindow({
      ...defaultSunlightProfile,
      season: 'winter',
    });

    expect(summer.sunsetMinutes - summer.sunriseMinutes).toBeGreaterThan(winter.sunsetMinutes - winter.sunriseMinutes);
  });

  it('uses explicit slider time when provided', () => {
    const profile = normalizeSunlightProfile({
      ...defaultSunlightProfile,
      solarTimeMinutes: 9 * 60 + 30,
    });
    const lighting = calculateSolarLighting(profile);

    expect(resolveSolarTimeMinutes(profile)).toBe(570);
    expect(lighting.localTimeMinutes).toBe(570);
    expect(formatSolarTime(lighting.localTimeMinutes)).toBe('09:30');
  });

  it('returns different solar results for Seoul and Jeju', () => {
    const seoul = calculateSolarLighting(defaultSunlightProfile);
    const jeju = calculateSolarLighting({
      ...defaultSunlightProfile,
      cityId: 'jeju',
      latitude: 33.4996,
      longitude: 126.5312,
    });

    expect(Math.abs(seoul.sunElevationDegrees - jeju.sunElevationDegrees)).toBeGreaterThan(1);
  });

  it('converts solar azimuth to scene azimuth through home orientation', () => {
    const south = calculateSolarLighting({
      ...defaultSunlightProfile,
      homeOrientationPreset: 'S',
    });
    const east = calculateSolarLighting({
      ...defaultSunlightProfile,
      homeOrientationPreset: 'E',
    });
    const diff = ((east.sceneAzimuthDegrees - south.sceneAzimuthDegrees) + 360) % 360;

    expect(diff).toBeCloseTo(90, 1);
  });

  it('normalizes custom orientation degrees', () => {
    const profile = normalizeSunlightProfile({
      ...defaultSunlightProfile,
      homeOrientationPreset: 'custom',
      customOrientationDegrees: 370,
    });

    expect(getHomeOrientationDegrees(profile)).toBe(10);
  });
});
