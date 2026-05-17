import type { PointerEvent } from 'react';
import type { PlacedFurniture } from '../types/layout';
import { getRotatedSize } from '../types/layout';
import { DoorSwingArc } from './DoorSwingArc';

interface CanvasFurnitureItemProps {
  item: PlacedFurniture;
  isSelected: boolean;
  isOverlapping: boolean;
  showDimensions?: boolean;
  zoom?: number;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>, item: PlacedFurniture) => void;
}

export function CanvasFurnitureItem({
  item,
  isSelected,
  isOverlapping,
  showDimensions = false,
  zoom = 1,
  onPointerDown,
}: CanvasFurnitureItemProps) {
  const footprint = getRotatedSize(item);
  const isDoor = item.kind === 'door';
  const normalizedRotation = ((item.rotation % 360) + 360) % 360;
  const usesCssRotation = normalizedRotation !== 0;
  const renderWidth = usesCssRotation ? item.width : footprint.width;
  const renderHeight = usesCssRotation ? item.height : footprint.height;

  const cx = item.x + footprint.width / 2;
  const cy = item.y + footprint.height / 2;
  const renderLeft = usesCssRotation ? cx - item.width / 2 : item.x;
  const renderTop = usesCssRotation ? cy - item.height / 2 : item.y;

  return (
    <button
      type="button"
      className={`furniture-item ${isSelected ? 'is-selected' : ''} ${item.isWallAttached ? 'is-wall-attached' : ''} ${isOverlapping ? 'is-overlapping' : ''} ${isDoor ? 'is-door' : ''}`}
      style={{
        left: renderLeft,
        top: renderTop,
        width: renderWidth,
        height: renderHeight,
        backgroundColor: item.color,
        transform: usesCssRotation ? `rotate(${normalizedRotation}deg)` : undefined,
        transformOrigin: usesCssRotation ? 'center center' : undefined,
      }}
      onPointerDown={(event) => onPointerDown(event, item)}
    >
      <DoorSwingArc item={item} />
      <span>{item.label}</span>
      {showDimensions && (
        <span className="furniture-dimension-label" style={{ transform: `translateY(-2px) scale(${1 / zoom})` }}>
          {Math.round(footprint.width)} × {Math.round(footprint.height)}
        </span>
      )}
      <span className="furniture-rotation">{item.rotation}°</span>
      {isOverlapping && <span className="overlap-badge" title="다른 가구와 겹침">!</span>}
    </button>
  );
}
