import type { PointerEvent } from 'react';
import type { PlacedFurniture } from '../types/layout';
import { getRotatedSize } from '../types/layout';
import { DoorSwingArc } from './DoorSwingArc';

interface CanvasFurnitureItemProps {
  item: PlacedFurniture;
  isSelected: boolean;
  isOverlapping: boolean;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>, item: PlacedFurniture) => void;
}

export function CanvasFurnitureItem({ item, isSelected, isOverlapping, onPointerDown }: CanvasFurnitureItemProps) {
  const footprint = getRotatedSize(item);
  const isDoor = item.templateId === 'door';
  const normalizedRotation = ((item.rotation % 360) + 360) % 360;
  const usesCssRotation = item.isWallAttached && normalizedRotation !== 0;
  const renderWidth = item.isWallAttached ? item.width : footprint.width;
  const renderHeight = item.isWallAttached ? item.height : footprint.height;

  const cx = item.x + footprint.width / 2;
  const cy = item.y + footprint.height / 2;
  const renderLeft = item.isWallAttached ? cx - item.width / 2 : item.x;
  const renderTop = item.isWallAttached ? cy - item.height / 2 : item.y;

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
      <span className="furniture-rotation">{item.rotation}°</span>
      {isOverlapping && <span className="overlap-badge" title="다른 가구와 겹침">!</span>}
    </button>
  );
}
