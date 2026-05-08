import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface PanStart {
  clientX: number;
  clientY: number;
  panX: number;
  panY: number;
}

interface PanPosition {
  x: number;
  y: number;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.2;
const WHEEL_ZOOM_SENSITIVITY = 0.002;

function clampZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(value, MAX_ZOOM));
}

export function useCanvasViewport(contentWidth: number, contentHeight: number) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const panStartRef = useRef<PanStart | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<PanPosition>({ x: 0, y: 0 });
  const [isSpaceDown, setIsSpaceDown] = useState(false);

  const getBoundedPan = (shell: HTMLElement, nextZoom: number, nextPan: PanPosition) => {
    const scaledWidth = contentWidth * nextZoom;
    const scaledHeight = contentHeight * nextZoom;

    const x =
      scaledWidth <= shell.clientWidth
        ? Math.round((shell.clientWidth - scaledWidth) / 2)
        : Math.min(0, Math.max(shell.clientWidth - scaledWidth, nextPan.x));
    const y =
      scaledHeight <= shell.clientHeight
        ? Math.round((shell.clientHeight - scaledHeight) / 2)
        : Math.min(0, Math.max(shell.clientHeight - scaledHeight, nextPan.y));

    return { x, y };
  };

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

            return getBoundedPan(shell, nextZoom, {
              x: cursorX - localX * nextZoom,
              y: cursorY - localY * nextZoom,
            });
          });

          return nextZoom;
        });
        return;
      }

      setPan((previousPan) =>
        getBoundedPan(shell, zoom, {
          x: previousPan.x - event.deltaX,
          y: previousPan.y - event.deltaY,
        }),
      );
    };

    shell.addEventListener('wheel', handleWheel, { passive: false });

    return () => shell.removeEventListener('wheel', handleWheel);
  }, [contentHeight, contentWidth, zoom]);

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

    const shell = shellRef.current;

    if (!shell) {
      return;
    }

    setPan(
      getBoundedPan(shell, zoom, {
        x: panStartRef.current.panX + event.clientX - panStartRef.current.clientX,
        y: panStartRef.current.panY + event.clientY - panStartRef.current.clientY,
      }),
    );
  };

  const endPan = (event: ReactPointerEvent<Element>) => {
    if (!panStartRef.current) {
      return;
    }

    panStartRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const zoomIn = () => {
    const shell = shellRef.current;
    const nextZoom = clampZoom(zoom + ZOOM_STEP);
    setZoom(nextZoom);

    if (shell) {
      setPan((currentPan) => getBoundedPan(shell, nextZoom, currentPan));
    }
  };

  const zoomOut = () => {
    const shell = shellRef.current;
    const nextZoom = clampZoom(zoom - ZOOM_STEP);
    setZoom(nextZoom);

    if (shell) {
      setPan((currentPan) => getBoundedPan(shell, nextZoom, currentPan));
    }
  };

  const centerViewport = (nextZoom = zoom) => {
    const shell = shellRef.current;

    if (!shell) {
      return;
    }

    setPan(
      getBoundedPan(shell, nextZoom, {
        x: Math.round((shell.clientWidth - contentWidth * nextZoom) / 2),
        y: Math.round((shell.clientHeight - contentHeight * nextZoom) / 2),
      }),
    );
  };

  const resetViewport = () => {
    const nextZoom = 1;
    setZoom(nextZoom);
    centerViewport(nextZoom);
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
    centerViewport,
    resetViewport,
  };
}
