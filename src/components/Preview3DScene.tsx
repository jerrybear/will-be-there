import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { koreanCities, getKoreanCity } from '../data/koreanCities';
import type { HomeOrientationPreset, PlacedFurniture, Room, SunlightProfile, SunlightSeason } from '../types/layout';
import { calculateSolarLighting, formatSolarTime, getSeasonalSunWindow, getHomeOrientationDegrees, homeOrientationLabels, normalizeSunlightProfile, orientationPresets, resolveSolarTimeMinutes } from '../utils/solarPosition';
import { applyWallVisibility, createCeilingShadowBlocker, createRoomSceneObjects, getFrontWallSegmentIds, toWorldLength } from '../utils/threeScene';

interface Preview3DSceneProps {
  room: Room;
  items: PlacedFurniture[];
  selectedId: string | null;
  sunlightProfile: SunlightProfile;
  onSunlightProfileChange: (update: Partial<SunlightProfile>) => void;
}

type CameraPreset = 'fit' | 'top' | 'corner' | 'eye';
type LightPreset = 'soft' | 'bright' | 'side' | 'overhead';
type DirectionLabels = {
  top: string;
  right: string;
  bottom: string;
  left: string;
};
type ScreenDirectionState = DirectionLabels & {
  topDegrees: number;
};

const cameraPresets: Record<CameraPreset, { label: string; yaw: number; pitch: number; distance: number }> = {
  fit: { label: '전체', yaw: -0.72, pitch: 0.72, distance: 1.82 },
  top: { label: '상단', yaw: -0.72, pitch: 1.16, distance: 1.72 },
  corner: { label: '사선', yaw: -0.95, pitch: 0.62, distance: 1.62 },
  eye: { label: '눈높이', yaw: -0.5, pitch: 0.38, distance: 1.34 },
};

const lightPresets: Record<LightPreset, { label: string; azimuth: number; elevation: number }> = {
  soft: { label: '기본', azimuth: 135, elevation: 45 },
  bright: { label: '밝게', azimuth: 110, elevation: 60 },
  side: { label: '측광', azimuth: 20, elevation: 30 },
  overhead: { label: '상부', azimuth: 180, elevation: 78 },
};

const quickOrientationPresets: Array<Exclude<HomeOrientationPreset, 'custom'>> = ['E', 'SE', 'S', 'SW', 'W'];

const seasonLabels: Record<SunlightSeason, string> = {
  spring: '봄',
  summer: '여름',
  autumn: '가을',
  winter: '겨울',
};

const compassCardinals = [
  { label: 'N', degrees: 0 },
  { label: 'E', degrees: 90 },
  { label: 'S', degrees: 180 },
  { label: 'W', degrees: 270 },
];

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function getNearestOrientationLabel(degrees: number) {
  const normalizedDegrees = normalizeDegrees(degrees);
  const nearestPresetIndex = Math.round(normalizedDegrees / 22.5) % orientationPresets.length;
  const nearestPreset = orientationPresets[nearestPresetIndex];

  return homeOrientationLabels[nearestPreset];
}

function getRealDirectionLabelFromSceneAzimuth(sceneAzimuthDegrees: number, homeOrientationDegrees: number) {
  // Scene azimuth 270deg is the 2D plan's upward direction.
  return getNearestOrientationLabel(homeOrientationDegrees + sceneAzimuthDegrees - 270);
}

function getScreenDirectionState(cameraYaw: number, homeOrientationDegrees: number): ScreenDirectionState {
  const yawDegrees = cameraYaw * 180 / Math.PI;
  const screenTopSceneAzimuth = normalizeDegrees(yawDegrees + 180);
  const screenRightSceneAzimuth = normalizeDegrees(yawDegrees - 90);
  const topDegrees = normalizeDegrees(homeOrientationDegrees + screenTopSceneAzimuth - 270);

  return {
    topDegrees,
    top: getRealDirectionLabelFromSceneAzimuth(screenTopSceneAzimuth, homeOrientationDegrees),
    right: getRealDirectionLabelFromSceneAzimuth(screenRightSceneAzimuth, homeOrientationDegrees),
    bottom: getRealDirectionLabelFromSceneAzimuth(screenTopSceneAzimuth + 180, homeOrientationDegrees),
    left: getRealDirectionLabelFromSceneAzimuth(screenRightSceneAzimuth + 180, homeOrientationDegrees),
  };
}

function getRoomFramingSize(room: Room) {
  return {
    width: Math.max(toWorldLength(room.width), 4),
    depth: Math.max(toWorldLength(room.height), 4),
    height: Math.max(toWorldLength(room.wallHeight), 2.4),
  };
}

function getFitDistance(room: Room, aspect: number, preset: CameraPreset) {
  const framing = getRoomFramingSize(room);
  const halfWidth = framing.width / 2;
  const halfHeight = framing.height / 2;
  const verticalFov = THREE.MathUtils.degToRad(45);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const distanceForHeight = halfHeight / Math.tan(verticalFov / 2);
  const distanceForWidth = halfWidth / Math.tan(horizontalFov / 2);
  const baseDistance = Math.max(distanceForHeight, distanceForWidth, framing.depth * 0.8);
  const presetMultiplier = cameraPresets[preset].distance;

  return baseDistance * presetMultiplier * 1.08;
}

function applyDirectionalLightPosition(
  light: THREE.DirectionalLight,
  room: Room,
  azimuth: number,
  elevation: number,
) {
  const framing = getRoomFramingSize(room);
  const roomSpan = Math.max(framing.width, framing.depth, framing.height, 4);
  const phi = (90 - elevation) * (Math.PI / 180);
  const theta = azimuth * (Math.PI / 180);
  const radius = roomSpan * 1.5;

  light.position.set(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function configureDirectionalLightShadow(light: THREE.DirectionalLight, room: Room) {
  const framing = getRoomFramingSize(room);
  const span = Math.max(framing.width, framing.depth, framing.height, 4);

  light.shadow.camera.left = -span * 0.9;
  light.shadow.camera.right = span * 0.9;
  light.shadow.camera.top = span * 0.9;
  light.shadow.camera.bottom = -span * 0.9;
  light.shadow.camera.near = 0.5;
  light.shadow.camera.far = span * 4.2;
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.03;
  light.shadow.camera.updateProjectionMatrix();
}

function applyDirectionalLighting(
  light: THREE.DirectionalLight,
  ambientLight: THREE.AmbientLight,
  room: Room,
  lighting: { sceneAzimuthDegrees: number; sunElevationDegrees: number; intensity: number; ambientIntensity: number; color: number },
) {
  applyDirectionalLightPosition(light, room, lighting.sceneAzimuthDegrees, lighting.sunElevationDegrees);
  configureDirectionalLightShadow(light, room);
  light.intensity = lighting.intensity;
  light.color.setHex(lighting.color);
  ambientLight.intensity = lighting.ambientIntensity;
}

export function Preview3DScene({ room, items, selectedId, sunlightProfile, onSunlightProfileChange }: Preview3DSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const directionalLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const cameraOrbitRef = useRef<{ yaw: number; pitch: number; distance: number } | null>(null);
  const lastCameraPresetRef = useRef<CameraPreset>('fit');
  
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('fit');
  const [lightAzimuth, setLightAzimuth] = useState(135);
  const [lightElevation, setLightElevation] = useState(45);
  const [activeLightPreset, setActiveLightPreset] = useState<LightPreset | null>('soft');
  const [isWallFadeEnabled, setIsWallFadeEnabled] = useState(true);
  const [isAdvancedLightControlsOpen, setIsAdvancedLightControlsOpen] = useState(false);
  const [isFineOrientationOpen, setIsFineOrientationOpen] = useState(false);
  const [screenDirectionState, setScreenDirectionState] = useState<ScreenDirectionState>(() =>
    getScreenDirectionState(cameraPresets.fit.yaw, getHomeOrientationDegrees(sunlightProfile)),
  );
  const lastScreenDirectionKeyRef = useRef('');
  const normalizedSunlightProfile = useMemo(() => normalizeSunlightProfile(sunlightProfile), [sunlightProfile]);
  const orientationDegrees = getHomeOrientationDegrees(normalizedSunlightProfile);
  const city = getKoreanCity(normalizedSunlightProfile.cityId);
  const sunWindow = useMemo(() => getSeasonalSunWindow(normalizedSunlightProfile), [normalizedSunlightProfile]);
  const solarTimeMinutes = resolveSolarTimeMinutes(normalizedSunlightProfile);
  const realisticLighting = useMemo(() => calculateSolarLighting(normalizedSunlightProfile), [normalizedSunlightProfile]);
  const effectiveLighting = normalizedSunlightProfile.mode === 'realistic'
    ? realisticLighting
    : {
        sunAzimuthDegrees: lightAzimuth,
        sunElevationDegrees: lightElevation,
        sceneAzimuthDegrees: lightAzimuth,
        intensity: 1.6,
        ambientIntensity: 1.25,
        color: 0xffffff,
      };

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount) {
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f5f9);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const framing = getRoomFramingSize(room);
    const roomSpan = Math.max(framing.width, framing.depth, framing.height, 4);
    camera.position.set(roomSpan * 0.62, roomSpan * 0.78, roomSpan * 0.9);
    camera.lookAt(0, framing.height * 0.38, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, effectiveLighting.ambientIntensity);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const directionalLight = new THREE.DirectionalLight(effectiveLighting.color, effectiveLighting.intensity);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.set(1024, 1024);
    applyDirectionalLighting(directionalLight, ambientLight, room, effectiveLighting);
    scene.add(directionalLight);
    directionalLightRef.current = directionalLight;

    const group = new THREE.Group();
    group.add(createCeilingShadowBlocker(room));
    const sceneObjects = createRoomSceneObjects(room, items, selectedId);
    sceneObjects.forEach((object) => group.add(object));
    scene.add(group);
    const wallObjects = sceneObjects.filter((object) => object.userData.wallSegmentId);

    const resize = () => {
      const { clientWidth, clientHeight } = mount;

      if (clientWidth === 0 || clientHeight === 0) {
        return;
      }

      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.far = Math.max(1000, roomSpan * 12);
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    let animationFrame = 0;
    let isDragging = false;
    let previousX = 0;
    let previousY = 0;
    const initialCamera = cameraPresets[cameraPreset];
    const shouldResetOrbit = lastCameraPresetRef.current !== cameraPreset || !cameraOrbitRef.current;
    const orbitState = shouldResetOrbit
      ? null
      : cameraOrbitRef.current;
    let yaw = orbitState ? orbitState.yaw : initialCamera.yaw;
    let pitch = orbitState ? orbitState.pitch : initialCamera.pitch;
    let distance = shouldResetOrbit
      ? getFitDistance(room, 1, cameraPreset)
      : (orbitState ? orbitState.distance : getFitDistance(room, 1, cameraPreset));
    lastCameraPresetRef.current = cameraPreset;

    const syncScreenDirectionLabels = () => {
      const nextState = getScreenDirectionState(yaw, orientationDegrees);
      const nextKey = `${nextState.top}|${nextState.right}|${nextState.bottom}|${nextState.left}|${Math.round(nextState.topDegrees)}`;

      if (lastScreenDirectionKeyRef.current !== nextKey) {
        lastScreenDirectionKeyRef.current = nextKey;
        setScreenDirectionState(nextState);
      }
    };

    const updateCamera = () => {
      const clampedPitch = Math.max(0.34, Math.min(1.18, pitch));
      pitch = clampedPitch;
      camera.position.set(
        Math.cos(yaw) * Math.cos(clampedPitch) * distance,
        Math.sin(clampedPitch) * distance,
        Math.sin(yaw) * Math.cos(clampedPitch) * distance,
      );
      camera.lookAt(0, framing.height * 0.38, 0);
      cameraOrbitRef.current = { yaw, pitch: clampedPitch, distance };
      syncScreenDirectionLabels();
    };

    const render = () => {
      updateCamera();
      const cameraForward = new THREE.Vector3();
      camera.getWorldDirection(cameraForward);
      const fadedSegmentIds = isWallFadeEnabled
        ? getFrontWallSegmentIds(room, camera.position, cameraForward)
        : null;
      applyWallVisibility(wallObjects, fadedSegmentIds);
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };

    const handlePointerDown = (event: PointerEvent) => {
      isDragging = true;
      previousX = event.clientX;
      previousY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging) {
        return;
      }

      yaw -= (event.clientX - previousX) * 0.008;
      pitch += (event.clientY - previousY) * 0.006;
      previousX = event.clientX;
      previousY = event.clientY;
    };

    const handlePointerUp = (event: PointerEvent) => {
      isDragging = false;
      renderer.domElement.releasePointerCapture(event.pointerId);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const minDistance = Math.max(framing.height * 0.75, roomSpan * 0.55);
      const maxDistance = roomSpan * 5.2;
      distance = Math.max(minDistance, Math.min(maxDistance, distance + event.deltaY * 0.02));
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
    render();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      directionalLightRef.current = null;
      ambientLightRef.current = null;
    };
  }, [cameraPreset, isWallFadeEnabled, items, orientationDegrees, room, selectedId]);

  useEffect(() => {
    if (directionalLightRef.current && ambientLightRef.current) {
      applyDirectionalLighting(directionalLightRef.current, ambientLightRef.current, room, effectiveLighting);
    }
  }, [effectiveLighting, room]);

  const applyLightPreset = (preset: LightPreset) => {
    const nextPreset = lightPresets[preset];
    onSunlightProfileChange({ mode: 'manual' });
    setActiveLightPreset(preset);
    setLightAzimuth(nextPreset.azimuth);
    setLightElevation(nextPreset.elevation);
  };

  const updateCity = (cityId: string) => {
    const nextCity = getKoreanCity(cityId);
    onSunlightProfileChange({
      cityId: nextCity.id,
      latitude: nextCity.latitude,
      longitude: nextCity.longitude,
    });
  };

  const updateOrientationPreset = (preset: HomeOrientationPreset) => {
    onSunlightProfileChange({
      homeOrientationPreset: preset,
      customOrientationDegrees: preset === 'custom'
        ? getHomeOrientationDegrees(normalizedSunlightProfile)
        : undefined,
    });
  };

  const modeLabel = normalizedSunlightProfile.mode === 'realistic' ? '현실 조명' : '수동 조명';
  const orientationLabel = normalizedSunlightProfile.homeOrientationPreset === 'custom'
    ? `${getNearestOrientationLabel(orientationDegrees)} ${Math.round(orientationDegrees)}°`
    : homeOrientationLabels[normalizedSunlightProfile.homeOrientationPreset];
  const northScreenDegrees = normalizeDegrees(-screenDirectionState.topDegrees);
  const sunScreenDegrees = normalizeDegrees(realisticLighting.sunAzimuthDegrees - screenDirectionState.topDegrees);

  return (
    <section className="panel preview-panel" style={{ position: 'relative' }}>
      <div className="panel-header">
        <h2>3D 미리보기</h2>
        <p>현재 방과 배치안을 3D로 확인합니다.</p>
      </div>

      <div className="preview-scene-shell">
        <div className="preview-scene" ref={mountRef} />

        <div className="room-direction-overlay" aria-label="화면 기준 동서남북">
          <span className="room-direction-label room-direction-top">화면 ↑ {screenDirectionState.top}</span>
          <span className="room-direction-label room-direction-right">화면 → {screenDirectionState.right}</span>
          <span className="room-direction-label room-direction-bottom">화면 ↓ {screenDirectionState.bottom}</span>
          <span className="room-direction-label room-direction-left">화면 ← {screenDirectionState.left}</span>
        </div>

        <div className="sun-compass" aria-label="햇빛 방향 표시">
          <div className="sun-compass-dial">
            {compassCardinals.map((cardinal) => (
              <span
                key={cardinal.label}
                className={`sun-compass-cardinal sun-compass-${cardinal.label.toLowerCase()}`}
                style={{ transform: `rotate(${cardinal.degrees - screenDirectionState.topDegrees}deg) translateY(-26px) rotate(${screenDirectionState.topDegrees - cardinal.degrees}deg)` }}
              >
                {cardinal.label}
              </span>
            ))}
            <span
              className="sun-compass-north-needle"
              style={{ transform: `translate(-50%, -100%) rotate(${northScreenDegrees}deg)` }}
            />
            <span
              className="sun-compass-sun-marker"
              style={{ transform: `rotate(${sunScreenDegrees}deg)` }}
            />
          </div>
          <div className="sun-compass-labels">
            <strong>화면 기준 나침반</strong>
            <span>도면 위쪽: {orientationLabel}</span>
            <span>{modeLabel} 햇빛: {getNearestOrientationLabel(realisticLighting.sunAzimuthDegrees)} / 고도 {Math.round(realisticLighting.sunElevationDegrees)}°</span>
          </div>
        </div>

        <div className="preview-top-toolbar">
          {(Object.entries(cameraPresets) as Array<[CameraPreset, typeof cameraPresets[CameraPreset]]>).map(([preset, config]) => (
            <button
              key={preset}
              type="button"
              className={cameraPreset === preset ? 'is-active' : ''}
              onClick={() => setCameraPreset(preset)}
            >
              {config.label}
            </button>
          ))}
        </div>

        <div className="preview-view-controls">
          <button
            type="button"
            className={`preview-view-control ${isWallFadeEnabled ? 'is-active' : ''}`}
            onClick={() => setIsWallFadeEnabled((currentValue) => !currentValue)}
          >
            {isWallFadeEnabled ? '자동 투명' : '불투명'}
          </button>
          <button
            type="button"
            className={`preview-view-control ${isAdvancedLightControlsOpen ? 'is-active' : ''}`}
            onClick={() => setIsAdvancedLightControlsOpen((currentValue) => !currentValue)}
          >
            {isAdvancedLightControlsOpen ? '일조 설정' : modeLabel}
          </button>

          {isAdvancedLightControlsOpen && (
            <div className="preview-view-panel">
              <section className="scene-control-section">
                <div className="scene-control-heading">
                  <h3 className="light-controls-title">일조 기준</h3>
                  <div className="mode-toggle">
                    <button
                      type="button"
                      className={normalizedSunlightProfile.mode === 'realistic' ? 'is-active' : ''}
                      onClick={() => onSunlightProfileChange({ mode: 'realistic' })}
                    >
                      현실
                    </button>
                    <button
                      type="button"
                      className={normalizedSunlightProfile.mode === 'manual' ? 'is-active' : ''}
                      onClick={() => onSunlightProfileChange({ mode: 'manual' })}
                    >
                      수동
                    </button>
                  </div>
                </div>

                <label className="compact-field" htmlFor="sunlightCity">
                  <span>도시</span>
                  <select
                    id="sunlightCity"
                    value={city.id}
                    onChange={(event) => updateCity(event.target.value)}
                  >
                    {koreanCities.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="sunlight-summary">
                  위도 {normalizedSunlightProfile.latitude.toFixed(2)}°, 경도 {normalizedSunlightProfile.longitude.toFixed(2)}°
                </div>

                <div className="compact-field">
                  <span>집 방향</span>
                  <div className="preset-button-grid orientation-quick-grid">
                    {quickOrientationPresets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={normalizedSunlightProfile.homeOrientationPreset === preset ? 'is-active' : ''}
                        onClick={() => updateOrientationPreset(preset)}
                      >
                        {homeOrientationLabels[preset]}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  className="text-toggle-button"
                  onClick={() => setIsFineOrientationOpen((currentValue) => !currentValue)}
                >
                  {isFineOrientationOpen ? '16방위 접기' : '16방위 전체 보기'}
                </button>

                {isFineOrientationOpen && (
                  <div className="preset-button-grid orientation-grid">
                    {orientationPresets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={normalizedSunlightProfile.homeOrientationPreset === preset ? 'is-active' : ''}
                        onClick={() => updateOrientationPreset(preset)}
                      >
                        {homeOrientationLabels[preset]}
                      </button>
                    ))}
                  </div>
                )}

                <div className="preset-button-grid preview-toggle-grid">
                  {(Object.entries(seasonLabels) as Array<[SunlightSeason, string]>).map(([season, label]) => (
                    <button
                      key={season}
                      type="button"
                      className={normalizedSunlightProfile.season === season ? 'is-active' : ''}
                      onClick={() => onSunlightProfileChange({ season })}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="sun-time-control">
                  <label htmlFor="solarTime">
                    <span>시간대</span>
                    <strong>{formatSolarTime(solarTimeMinutes)}</strong>
                  </label>
                  <input
                    id="solarTime"
                    type="range"
                    min={Math.round(sunWindow.sunriseMinutes)}
                    max={Math.round(sunWindow.sunsetMinutes)}
                    step="10"
                    value={solarTimeMinutes}
                    onChange={(event) => {
                      onSunlightProfileChange({
                        solarTimeMinutes: Number(event.target.value),
                      });
                    }}
                  />
                  <div className="sun-time-scale">
                    <span>일출 {formatSolarTime(sunWindow.sunriseMinutes)}</span>
                    <span>정오 {formatSolarTime(sunWindow.solarNoonMinutes)}</span>
                    <span>일몰 {formatSolarTime(sunWindow.sunsetMinutes)}</span>
                  </div>
                </div>
              </section>

              <div className="scene-advanced-controls">
                <section className="scene-control-section scene-control-compact">
                  <h3 className="light-controls-title">고급 조명</h3>
                  <div className="preset-button-grid">
                    {(Object.entries(lightPresets) as Array<[LightPreset, typeof lightPresets[LightPreset]]>).map(([preset, config]) => (
                      <button
                        key={preset}
                        type="button"
                        className={activeLightPreset === preset && normalizedSunlightProfile.mode === 'manual' ? 'is-active' : ''}
                        onClick={() => applyLightPreset(preset)}
                      >
                        {config.label}
                      </button>
                    ))}
                  </div>
                </section>

                <label className="compact-field" htmlFor="customOrientation">
                  <span>직접 방위</span>
                  <input
                    id="customOrientation"
                    type="number"
                    min="0"
                    max="359"
                    step="1"
                    value={Math.round(orientationDegrees)}
                    onChange={(event) => {
                      onSunlightProfileChange({
                        homeOrientationPreset: 'custom',
                        customOrientationDegrees: Number(event.target.value),
                      });
                    }}
                  />
                </label>
                <div className="control-group">
                  <label htmlFor="lightAzimuth">
                    <span>방향</span>
                    <span>{lightAzimuth}°</span>
                  </label>
                  <input 
                    id="lightAzimuth" 
                    type="range" 
                    min="0" 
                    max="360" 
                    value={lightAzimuth} 
                    onChange={(e) => {
                      onSunlightProfileChange({ mode: 'manual' });
                      setActiveLightPreset(null);
                      setLightAzimuth(Number(e.target.value));
                    }} 
                  />
                </div>
                <div className="control-group">
                  <label htmlFor="lightElevation">
                    <span>높이</span>
                    <span>{lightElevation}°</span>
                  </label>
                  <input 
                    id="lightElevation" 
                    type="range" 
                    min="10" 
                    max="80" 
                    value={lightElevation} 
                    onChange={(e) => {
                      onSunlightProfileChange({ mode: 'manual' });
                      setActiveLightPreset(null);
                      setLightElevation(Number(e.target.value));
                    }} 
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
