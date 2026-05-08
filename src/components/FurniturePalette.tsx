import { useMemo, useState } from 'react';
import type { CustomFurnitureTemplateDraft, FurnitureCategory, FurnitureTemplate } from '../types/layout';

interface FurniturePaletteProps {
  items: FurnitureTemplate[];
  onAdd: (templateId: string) => void;
  onAddCustomItem: (template: CustomFurnitureTemplateDraft) => string | null;
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

const customItemCategories: FurnitureCategory[] = ['seating', 'tables', 'storage'];

const defaultDraft = {
  label: '',
  category: 'seating' as FurnitureCategory,
  width: '120',
  height: '80',
  objectHeight: '70',
  color: '#94a3b8',
};

export function FurniturePalette({ items, onAdd, onAddCustomItem }: FurniturePaletteProps) {
  const [activeCategory, setActiveCategory] = useState<FurnitureCategory>('doors');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [draft, setDraft] = useState(defaultDraft);
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
  const parsedWidth = Number(draft.width);
  const parsedHeight = Number(draft.height);
  const parsedObjectHeight = Number(draft.objectHeight);
  const isValidDraft =
    !!draft.label.trim() &&
    Number.isFinite(parsedWidth) &&
    parsedWidth > 0 &&
    Number.isFinite(parsedHeight) &&
    parsedHeight > 0 &&
    Number.isFinite(parsedObjectHeight) &&
    parsedObjectHeight > 0 &&
    /^#[0-9a-fA-F]{6}$/.test(draft.color);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isValidDraft) {
      return;
    }

    const createdId = onAddCustomItem({
      label: draft.label,
      category: draft.category,
      width: parsedWidth,
      height: parsedHeight,
      objectHeight: parsedObjectHeight,
      color: draft.color,
    });

    if (!createdId) {
      return;
    }

    setActiveCategory(draft.category);
    setDraft(defaultDraft);
    setIsFormOpen(false);
  };

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
        {isFormOpen && (
          <form className="custom-item-form" onSubmit={handleSubmit}>
            <label>
              <span>이름</span>
              <input
                type="text"
                value={draft.label}
                onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, label: event.target.value }))}
                placeholder="예: 협탁"
              />
            </label>
            <label>
              <span>카테고리</span>
              <select
                value={draft.category}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    category: event.target.value as FurnitureCategory,
                  }))
                }
              >
                {customItemCategories.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabelMap[category]}
                  </option>
                ))}
              </select>
            </label>
            <div className="custom-item-grid">
              <label>
                <span>가로</span>
                <input
                  type="number"
                  min="20"
                  step="1"
                  value={draft.width}
                  onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, width: event.target.value }))}
                />
              </label>
              <label>
                <span>깊이</span>
                <input
                  type="number"
                  min="20"
                  step="1"
                  value={draft.height}
                  onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, height: event.target.value }))}
                />
              </label>
              <label>
                <span>높이</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={draft.objectHeight}
                  onChange={(event) =>
                    setDraft((currentDraft) => ({ ...currentDraft, objectHeight: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>색상</span>
                <input
                  type="color"
                  value={draft.color}
                  onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, color: event.target.value }))}
                />
              </label>
            </div>
            <div className="custom-item-actions">
              <button type="submit" className="primary-button compact-button" disabled={!isValidDraft}>
                추가
              </button>
              <button
                type="button"
                className="ghost-button compact-button"
                onClick={() => {
                  setDraft(defaultDraft);
                  setIsFormOpen(false);
                }}
              >
                취소
              </button>
            </div>
          </form>
        )}
        <button
          type="button"
          className="ghost-button palette-footer-button"
          onClick={() => setIsFormOpen((currentState) => !currentState)}
        >
          직접 추가
        </button>
      </div>
    </section>
  );
}
