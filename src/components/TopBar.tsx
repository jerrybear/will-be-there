import { useState } from 'react';
import type { SavedLayout } from '../types/layout';

interface TopBarProps {
  savedLayouts: SavedLayout[];
  currentLayoutId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onReset: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateMeta: (id: string, name: string, memo: string) => void;
}

function formatSavedTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function TopBar({
  savedLayouts,
  currentLayoutId,
  canUndo,
  canRedo,
  onReset,
  onUndo,
  onRedo,
  onLoad,
  onDelete,
  onUpdateMeta,
}: TopBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingLayoutId, setEditingLayoutId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState({ name: '', memo: '' });

  const handleEditStart = (layout: SavedLayout) => {
    setEditingLayoutId(layout.id);
    setEditingDraft({ name: layout.name, memo: layout.memo });
  };

  const handleEditSave = (id: string) => {
    onUpdateMeta(id, editingDraft.name, editingDraft.memo);
    setEditingLayoutId(null);
  };

  const handleEditCancel = () => {
    setEditingLayoutId(null);
  };

  const handleLoad = (id: string) => {
    onLoad(id);
    setIsOpen(false);
  };

  return (
    <header className="top-bar">
      <div>
        <h1>이거여기</h1>
        <p>옮기기 전에, 여기 한번 놔보기</p>
      </div>
      <div className="top-bar-actions">
        <div className="history-actions">
          <button type="button" className="ghost-button compact-button" onClick={onUndo} disabled={!canUndo}>
            Undo
          </button>
          <button type="button" className="ghost-button compact-button" onClick={onRedo} disabled={!canRedo}>
            Redo
          </button>
        </div>
        <div className="saved-layouts-dropdown">
          <button type="button" className="ghost-button" onClick={() => setIsOpen(!isOpen)}>
            저장된 배치안 ▼
          </button>
          
          {isOpen && (
            <div className="dropdown-menu">
              {savedLayouts.length === 0 ? (
                <div className="empty-state compact-empty">저장된 배치안이 없습니다.</div>
              ) : (
                <div className="saved-layout-list">
                  {savedLayouts.map((layout) => {
                    const isEditing = editingLayoutId === layout.id;

                    if (isEditing) {
                      return (
                        <article key={layout.id} className="saved-layout-card editing">
                          <div className="edit-fields">
                            <input
                              type="text"
                              value={editingDraft.name}
                              onChange={(e) => setEditingDraft((draft) => ({ ...draft, name: e.target.value }))}
                              placeholder="이름"
                            />
                            <textarea
                              value={editingDraft.memo}
                              onChange={(e) => setEditingDraft((draft) => ({ ...draft, memo: e.target.value }))}
                              placeholder="메모"
                              rows={2}
                              className="memo-input"
                            />
                          </div>
                          <div className="saved-layout-actions">
                            <button type="button" className="primary-button compact-button" onClick={() => handleEditSave(layout.id)} disabled={!editingDraft.name.trim()}>
                              완료
                            </button>
                            <button type="button" className="ghost-button compact-button" onClick={handleEditCancel}>
                              취소
                            </button>
                          </div>
                        </article>
                      );
                    }

                    return (
                      <article key={layout.id} className={`saved-layout-card ${layout.id === currentLayoutId ? 'is-active' : ''}`}>
                        <div className="layout-info">
                          <strong>{layout.name}</strong>
                          {layout.memo && <p className="layout-memo">{layout.memo}</p>}
                          <span>
                            {layout.items.length}개 가구 · {formatSavedTime(layout.updatedAt)}
                          </span>
                        </div>
                        <div className="saved-layout-actions">
                          <button type="button" className="ghost-button compact-button" onClick={() => handleEditStart(layout)}>
                            수정
                          </button>
                          <button type="button" className="ghost-button compact-button" onClick={() => handleLoad(layout.id)}>
                            불러오기
                          </button>
                          <button type="button" className="ghost-button compact-button danger-button" onClick={() => onDelete(layout.id)}>
                            삭제
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        <button type="button" className="ghost-button" onClick={onReset}>
          Reset
        </button>
      </div>
    </header>
  );
}
