import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface PanStart {
  clientX: number;
  clientY: number;
  panX: number;
  panY: number;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.2;
const WHEEL_ZOOM_SENSITIVITY = 0.002;

function clampZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(value, MAX_ZOOM));
}

export function useCanvasViewport() {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const panStartRef = useRef<PanStart | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isSpaceDown, setIsSpaceDown] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setIsSpaceDown(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setIsSpaceDown(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const shell = shellRef.current;

    if (!shell) {
      return undefined;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      if (event.ctrlKey || event.metaKey) {
        setZoom((previousZoom) => {
          const nextZoom = clampZoom(previousZoom - event.deltaY * WHEEL_ZOOM_SENSITIVITY);

          setPan((previousPan) => {
            const rect = shell.getBoundingClientRect();
            const cursorX = event.clientX - rect.left;
            const cursorY = event.clientY - rect.top;
            const localX = (cursorX - previousPan.x) / previousZoom;
            const localY = (cursorY - previousPan.y) / previousZoom;

            return {
              x: cursorX - localX * nextZoom,
              y: cursorY - localY * nextZoom,
            };
          });

          return nextZoom;
        });
        return;
      }

      setPan((previousPan) => ({
        x: previousPan.x - event.deltaX,
        y: previousPan.y - event.deltaY,
      }));
    };

    shell.addEventListener('wheel', handleWheel, { passive: false });

    return () => shell.removeEventListener('wheel', handleWheel);
  }, []);

  const beginPan = (event: ReactPointerEvent<Element>) => {
    if (event.button !== 1 && !isSpaceDown) {
      return false;
    }

    panStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);

    return true;
  };

  const updatePan = (event: ReactPointerEvent<Element>) => {
    if (!panStartRef.current) {
      return;
    }

    setPan({
      x: panStartRef.current.panX + event.clientX - panStartRef.current.clientX,
      y: panStartRef.current.panY + event.clientY - panStartRef.current.clientY,
    });
  };

  const endPan = (event: ReactPointerEvent<Element>) => {
    if (!panStartRef.current) {
      return;
    }

    panStartRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const zoomIn = () => {
    setZoom((currentZoom) => clampZoom(currentZoom + ZOOM_STEP));
  };

  const zoomOut = () => {
    setZoom((currentZoom) => clampZoom(currentZoom - ZOOM_STEP));
  };

  const resetViewport = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return {
    shellRef,
    zoom,
    pan,
    isSpaceDown,
    beginPan,
    updatePan,
    endPan,
    zoomIn,
    zoomOut,
    resetViewport,
  };
}
