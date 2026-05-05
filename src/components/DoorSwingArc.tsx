import type { CSSProperties } from 'react';
import type { PlacedFurniture } from '../types/layout';

interface DoorSwingArcProps {
  item: PlacedFurniture;
}

function getDoorSwingStyle(item: PlacedFurniture): CSSProperties | null {
  if (item.templateId !== 'door' || !item.showDoorSwing || !item.doorHinge || !item.doorSwingDir) {
    return null;
  }

  const radius = Math.max(item.width, item.height);
  const baseStyle: CSSProperties = {
    width: radius,
    height: radius,
  };
  const isHorizontal = item.width >= item.height;

  if (isHorizontal) {
    if (item.doorSwingDir === 'front') {
      return item.doorHinge === 'left'
        ? { ...baseStyle, left: 0, top: -radius, borderTopRightRadius: '100%', borderTop: '1.5px solid #64748b', borderRight: '1.5px solid #64748b' }
        : { ...baseStyle, right: 0, top: -radius, borderTopLeftRadius: '100%', borderTop: '1.5px solid #64748b', borderLeft: '1.5px solid #64748b' };
    }

    return item.doorHinge === 'left'
      ? { ...baseStyle, left: 0, top: item.height, borderBottomRightRadius: '100%', borderBottom: '1.5px solid #64748b', borderRight: '1.5px solid #64748b' }
      : { ...baseStyle, right: 0, top: item.height, borderBottomLeftRadius: '100%', borderBottom: '1.5px solid #64748b', borderLeft: '1.5px solid #64748b' };
  }

  if (item.doorSwingDir === 'front') {
    return item.doorHinge === 'left'
      ? { ...baseStyle, left: -radius, top: 0, borderBottomLeftRadius: '100%', borderBottom: '1.5px solid #64748b', borderLeft: '1.5px solid #64748b' }
      : { ...baseStyle, left: -radius, bottom: 0, borderTopLeftRadius: '100%', borderTop: '1.5px solid #64748b', borderLeft: '1.5px solid #64748b' };
  }

  return item.doorHinge === 'left'
    ? { ...baseStyle, left: item.width, top: 0, borderBottomRightRadius: '100%', borderBottom: '1.5px solid #64748b', borderRight: '1.5px solid #64748b' }
    : { ...baseStyle, left: item.width, bottom: 0, borderTopRightRadius: '100%', borderTop: '1.5px solid #64748b', borderRight: '1.5px solid #64748b' };
}

export function DoorSwingArc({ item }: DoorSwingArcProps) {
  const swingStyle = getDoorSwingStyle(item);

  if (!swingStyle) {
    return null;
  }

  return <div className="door-swing-arc" style={swingStyle} />;
}
