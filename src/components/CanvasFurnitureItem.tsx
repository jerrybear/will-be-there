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
  const usesFreeRotation = normalizedRotation !== 0 && normalizedRotation !== 90 && normalizedRotation !== 180 && normalizedRotation !== 270;

  return (
    <button
      type="button"
      className={`furniture-item ${isSelected ? 'is-selected' : ''} ${item.isWallAttached ? 'is-wall-attached' : ''} ${isOverlapping ? 'is-overlapping' : ''} ${isDoor ? 'is-door' : ''}`}
      style={{
        left: item.x,
        top: item.y,
        width: footprint.width,
        height: footprint.height,
        backgroundColor: item.color,
        transform: usesFreeRotation ? `rotate(${normalizedRotation}deg)` : undefined,
        transformOrigin: usesFreeRotation ? 'center center' : undefined,
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
