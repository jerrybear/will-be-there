import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { PlacedFurniture, Room } from '../types/layout';
import { applyWallVisibility, createRoomSceneObjects, getFrontWallSegmentId, toWorldLength } from '../utils/threeScene';

interface Preview3DSceneProps {
  room: Room;
  items: PlacedFurniture[];
  selectedId: string | null;
}

type CameraPreset = 'fit' | 'top' | 'corner' | 'eye';
type LightPreset = 'soft' | 'bright' | 'side' | 'overhead';

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

function applyDirectionalLightPosition(
  light: THREE.DirectionalLight,
  room: Room,
  azimuth: number,
  elevation: number,
) {
  const roomSpan = Math.max(toWorldLength(room.width), toWorldLength(room.height), 4);
  const phi = (90 - elevation) * (Math.PI / 180);
  const theta = azimuth * (Math.PI / 180);
  const radius = roomSpan * 1.5;

  light.position.set(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

export function Preview3DScene({ room, items, selectedId }: Preview3DSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const directionalLightRef = useRef<THREE.DirectionalLight | null>(null);
  
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('fit');
  const [lightAzimuth, setLightAzimuth] = useState(135);
  const [lightElevation, setLightElevation] = useState(45);
  const [activeLightPreset, setActiveLightPreset] = useState<LightPreset | null>('soft');

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

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const roomSpan = Math.max(toWorldLength(room.width), toWorldLength(room.height), 4);
    camera.position.set(roomSpan * 0.62, roomSpan * 0.78, roomSpan * 0.9);
    camera.lookAt(0, 0, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.25);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.6);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.set(1024, 1024);
    applyDirectionalLightPosition(directionalLight, room, lightAzimuth, lightElevation);
    scene.add(directionalLight);
    directionalLightRef.current = directionalLight;

    const group = new THREE.Group();
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
    let yaw = initialCamera.yaw;
    let pitch = initialCamera.pitch;
    let distance = roomSpan * initialCamera.distance;

    const updateCamera = () => {
      const clampedPitch = Math.max(0.34, Math.min(1.18, pitch));
      camera.position.set(
        Math.cos(yaw) * Math.cos(clampedPitch) * distance,
        Math.sin(clampedPitch) * distance,
        Math.sin(yaw) * Math.cos(clampedPitch) * distance,
      );
      camera.lookAt(0, 0, 0);
    };

    const render = () => {
      updateCamera();
      const cameraForward = new THREE.Vector3();
      camera.getWorldDirection(cameraForward);
      const fadedSegmentId = getFrontWallSegmentId(room, camera.position, cameraForward);
      applyWallVisibility(wallObjects, fadedSegmentId);
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
      distance = Math.max(roomSpan * 0.9, Math.min(roomSpan * 2.8, distance + event.deltaY * 0.01));
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
    };
  }, [cameraPreset, items, room, selectedId]);

  useEffect(() => {
    if (directionalLightRef.current) {
      applyDirectionalLightPosition(directionalLightRef.current, room, lightAzimuth, lightElevation);
    }
  }, [lightAzimuth, lightElevation, room.width, room.height]);

  const applyLightPreset = (preset: LightPreset) => {
    const nextPreset = lightPresets[preset];
    setActiveLightPreset(preset);
    setLightAzimuth(nextPreset.azimuth);
    setLightElevation(nextPreset.elevation);
  };

  return (
    <section className="panel preview-panel" style={{ position: 'relative' }}>
      <div className="panel-header">
        <h2>3D 미리보기</h2>
        <p>현재 방과 배치안을 3D로 확인합니다.</p>
      </div>

      <div className="preview-scene" ref={mountRef} />
      
      <div className="scene-controls-panel">
        <section className="scene-control-section">
          <h3 className="light-controls-title">카메라</h3>
          <div className="preset-button-grid">
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
        </section>

        <section className="scene-control-section">
          <h3 className="light-controls-title">조명</h3>
          <div className="preset-button-grid">
            {(Object.entries(lightPresets) as Array<[LightPreset, typeof lightPresets[LightPreset]]>).map(([preset, config]) => (
              <button
                key={preset}
                type="button"
                className={activeLightPreset === preset ? 'is-active' : ''}
                onClick={() => applyLightPreset(preset)}
              >
                {config.label}
              </button>
            ))}
          </div>
        </section>

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
              setActiveLightPreset(null);
              setLightElevation(Number(e.target.value));
            }} 
          />
        </div>
      </div>
    </section>
  );
}
