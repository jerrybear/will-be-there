import type { FurnitureTemplate } from '../types/layout';

interface FurniturePaletteProps {
  items: FurnitureTemplate[];
  onAdd: (templateId: string) => void;
}

function format3DSize(item: FurnitureTemplate) {
  return `${item.width} × ${item.height} × ${item.objectHeight}`;
}

export function FurniturePalette({ items, onAdd }: FurniturePaletteProps) {
  return (
    <section className="panel palette-panel">
      <div className="panel-header">
        <h2>가구 팔레트</h2>
        <p>추가할 가구를 선택하세요.</p>
      </div>

      <div className="palette-list">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="palette-card"
            onClick={() => onAdd(item.id)}
          >
            <span className="palette-swatch" style={{ backgroundColor: item.color }} />
            <span className="palette-name">
              {item.label}
              {item.isWallAttached && <span className="wall-badge">벽 부착</span>}
            </span>
            <span className="palette-size">
              <span>{format3DSize(item)}</span>
              <span className="palette-size-label">가로 × 깊이 × 높이</span>
              {!!item.elevation && <span className="palette-size-label">설치 높이 {item.elevation}</span>}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
