import { useState } from 'react';
import type { SavedLayout, ViewMode } from '../types/layout';

interface TopBarProps {
  viewMode: ViewMode;
  savedLayouts: SavedLayout[];
  currentLayoutId: string | null;
  currentLayoutName: string | null;
  hasUnsavedChanges: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onReset: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateMeta: (id: string, name: string, memo: string) => void;
  onSaveCurrent: () => void;
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
  viewMode,
  savedLayouts,
  currentLayoutId,
  currentLayoutName,
  hasUnsavedChanges,
  canUndo,
  canRedo,
  onReset,
  onViewModeChange,
  onUndo,
  onRedo,
  onLoad,
  onDelete,
  onUpdateMeta,
  onSaveCurrent,
}: TopBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isShortcutOpen, setIsShortcutOpen] = useState(false);
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

  const handleViewModeChange = (mode: ViewMode) => {
    setIsOpen(false);
    setIsShortcutOpen(false);
    onViewModeChange(mode);
  };

  const handleShortcutToggle = () => {
    setIsOpen(false);
    setIsShortcutOpen((current) => !current);
  };

  const handleSavedLayoutsToggle = () => {
    setIsShortcutOpen(false);
    setIsOpen((current) => !current);
  };

  return (
    <header className="top-bar">
      <div className="top-bar-brand">
        <div className="top-bar-title-row">
          <h1>이거여기</h1>
          <span className="top-bar-chip">{viewMode === '2d' ? '2D 편집' : '3D 미리보기'}</span>
        </div>
        <p>{currentLayoutName ? `${currentLayoutName}${hasUnsavedChanges ? ' · 수정됨' : ''}` : '옮기기 전에, 여기 한번 놔 보기'}</p>
      </div>
      <div className="top-bar-actions">
        <div className="view-mode-toggle" aria-label="보기 전환">
          <button
            type="button"
            className={viewMode === '2d' ? 'active' : ''}
            onClick={() => handleViewModeChange('2d')}
          >
            2D 편집
          </button>
          <button
            type="button"
            className={viewMode === '3d' ? 'active' : ''}
            onClick={() => handleViewModeChange('3d')}
          >
            3D 미리보기
          </button>
        </div>
        <div className="history-actions">
          <button type="button" className="ghost-button compact-button" onClick={onUndo} disabled={!canUndo}>
            실행 취소
          </button>
          <button type="button" className="ghost-button compact-button" onClick={onRedo} disabled={!canRedo}>
            다시 실행
          </button>
        </div>
        <div className="shortcuts-dropdown">
          <button type="button" className="ghost-button" onClick={handleShortcutToggle}>
            단축키
          </button>
          {isShortcutOpen && (
            <div className="shortcuts-menu">
              <h3>단축키</h3>
              <dl>
                <div><dt>⌘/Ctrl + Z</dt><dd>실행 취소</dd></div>
                <div><dt>⌘/Ctrl + Shift + Z</dt><dd>다시 실행</dd></div>
                <div><dt>⌘/Ctrl + C / V</dt><dd>가구 복사/붙여넣기</dd></div>
                <div><dt>Delete</dt><dd>선택 가구 삭제</dd></div>
                <div><dt>Arrow</dt><dd>1px 또는 스냅 단위 이동</dd></div>
                <div><dt>Shift + Arrow</dt><dd>24px 이동</dd></div>
                <div><dt>R</dt><dd>90도 회전</dd></div>
                <div><dt>S</dt><dd>스냅 켜기/끄기</dd></div>
                <div><dt>Space + Drag</dt><dd>캔버스 이동</dd></div>
              </dl>
            </div>
          )}
        </div>
        <div className="saved-layouts-dropdown">
          <button type="button" className="ghost-button" onClick={handleSavedLayoutsToggle}>
            저장된 도면
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
                          <strong>
                            {layout.name}
                            {layout.id === currentLayoutId && hasUnsavedChanges ? ' · 수정됨' : ''}
                          </strong>
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
        <button
          type="button"
          className="primary-button"
          onClick={onSaveCurrent}
          disabled={!currentLayoutId || !hasUnsavedChanges}
          title={currentLayoutId ? '현재 선택한 도면에 덮어씁니다.' : '새 저장은 우측 패널에서 이름을 지정해 진행합니다.'}
        >
          저장하기
        </button>
        <button type="button" className="ghost-button" onClick={onReset}>
          초기화
        </button>
      </div>
    </header>
  );
}
