import { useMemo, useState } from 'react';
import type { FurnitureCategory, FurnitureTemplate } from '../types/layout';

interface FurniturePaletteProps {
  items: FurnitureTemplate[];
  onAdd: (templateId: string) => void;
}

function format3DSize(item: FurnitureTemplate) {
  return `${item.width} × ${item.height} × ${item.objectHeight}`;
}

const categoryOrder: FurnitureCategory[] = ['doors', 'windows', 'seating', 'tables', 'storage'];

const categoryLabelMap: Record<FurnitureCategory, string> = {
  doors: '문',
  windows: '창문',
  seating: '의자/소파',
  tables: '테이블',
  storage: '수납',
};

export function FurniturePalette({ items, onAdd }: FurniturePaletteProps) {
  const [activeCategory, setActiveCategory] = useState<FurnitureCategory>('doors');
  const groupedItems = useMemo(
    () =>
      categoryOrder.map((category) => ({
        category,
        label: categoryLabelMap[category],
        items: items.filter((item) => item.category === category),
      })),
    [items],
  );
  const visibleItems = groupedItems.find((group) => group.category === activeCategory)?.items ?? [];

  return (
    <section className="panel palette-panel">
      <div className="panel-header">
        <h2>가구 팔레트</h2>
        <p>배치할 항목을 골라 캔버스에 추가합니다</p>
      </div>

      <div className="palette-category-list" role="tablist" aria-label="라이브러리 카테고리">
        {groupedItems.map((group) => (
          <button
            key={group.category}
            type="button"
            role="tab"
            className={`palette-category-button ${group.category === activeCategory ? 'is-active' : ''}`}
            aria-selected={group.category === activeCategory}
            onClick={() => setActiveCategory(group.category)}
          >
            <span>{group.label}</span>
          </button>
        ))}
      </div>

      <div className="palette-list">
        {visibleItems.map((item) => (
          <button key={item.id} type="button" className="palette-card" onClick={() => onAdd(item.id)}>
            <div className="palette-card-preview">
              <span className="palette-swatch" style={{ backgroundColor: item.color }} />
            </div>
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

      <div className="palette-footer">
        <button type="button" className="ghost-button palette-footer-button" disabled title="커스텀 아이템 추가는 아직 구현되지 않았습니다.">
          직접 추가
        </button>
      </div>
    </section>
  );
}
