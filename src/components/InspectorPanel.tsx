import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { PlacedFurniture } from '../types/layout';
import type { Room } from '../types/layout';
import type { SavedLayout } from '../types/layout';
import { getRotatedSize } from '../types/layout';

interface InspectorPanelProps {
  room: Room;
  item: PlacedFurniture | null;
  savedLayouts: SavedLayout[];
  onRotate: (id: string) => void;
  onResizeRoom: (width: number, height: number) => void;
  onSave: (name: string) => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatSavedTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function InspectorPanel({ room, item, savedLayouts, onRotate, onResizeRoom, onSave, onLoad, onDelete }: InspectorPanelProps) {
  const [layoutName, setLayoutName] = useState('');
  const [roomDraft, setRoomDraft] = useState({
    width: String(room.width),
    height: String(room.height),
  });

  useEffect(() => {
    setRoomDraft({
      width: String(room.width),
      height: String(room.height),
    });
  }, [room.width, room.height]);

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(layoutName);
    setLayoutName('');
  };

  const draftWidth = Number(roomDraft.width);
  const draftHeight = Number(roomDraft.height);
  const hasValidRoomDraft = Number.isFinite(draftWidth) && Number.isFinite(draftHeight) && draftWidth > 0 && draftHeight > 0;
  const hasRoomChanges = draftWidth !== room.width || draftHeight !== room.height;

  const handleRoomSizeApply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!hasValidRoomDraft) {
      return;
    }

    onResizeRoom(draftWidth, draftHeight);
  };

  const savedLayoutsSection = (
    <div className="saved-layouts">
      <h3>저장안</h3>
      <form className="save-form" onSubmit={handleSave}>
        <input
          type="text"
          value={layoutName}
          onChange={(event) => setLayoutName(event.target.value)}
          placeholder="예: 침실 배치 1"
          aria-label="저장안 이름"
        />
        <button type="submit" className="primary-button compact-button" disabled={!layoutName.trim()}>
          저장
        </button>
      </form>

      {savedLayouts.length === 0 ? (
        <div className="empty-state compact-empty">저장된 배치안이 없습니다.</div>
      ) : (
        <div className="saved-layout-list">
          {savedLayouts.map((layout) => (
            <article key={layout.id} className="saved-layout-card">
              <div>
                <strong>{layout.name}</strong>
                <span>
                  {layout.items.length}개 가구 · {formatSavedTime(layout.updatedAt)}
                </span>
              </div>
              <div className="saved-layout-actions">
                <button type="button" className="ghost-button compact-button" onClick={() => onLoad(layout.id)}>
                  불러오기
                </button>
                <button type="button" className="ghost-button compact-button danger-button" onClick={() => onDelete(layout.id)}>
                  삭제
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );

  const roomSizeSection = (
    <div className="room-size-editor">
      <h3>방 크기</h3>
      <form className="room-size-form" onSubmit={handleRoomSizeApply}>
        <div className="dimension-fields">
          <label>
            <span>폭</span>
            <input
              type="number"
              min="240"
              max="1200"
              step="10"
              value={roomDraft.width}
              onChange={(event) => setRoomDraft((currentDraft) => ({ ...currentDraft, width: event.target.value }))}
            />
          </label>
          <label>
            <span>높이</span>
            <input
              type="number"
              min="180"
              max="900"
              step="10"
              value={roomDraft.height}
              onChange={(event) => setRoomDraft((currentDraft) => ({ ...currentDraft, height: event.target.value }))}
            />
          </label>
        </div>
        <button type="submit" className="primary-button compact-button" disabled={!hasValidRoomDraft || !hasRoomChanges}>
          적용
        </button>
      </form>
      <p>240×180부터 1200×900까지 조정할 수 있습니다.</p>
    </div>
  );

  if (!item) {
    return (
      <section className="panel inspector-panel">
        <div className="panel-header">
          <h2>선택 가구</h2>
          <p>방 안의 가구를 클릭하면 상세 정보가 보입니다.</p>
        </div>
        {roomSizeSection}
        <div className="empty-state">아직 선택된 가구가 없습니다.</div>
        {savedLayoutsSection}
      </section>
    );
  }

  const footprint = getRotatedSize(item);

  return (
    <section className="panel inspector-panel">
      <div className="panel-header">
        <h2>{item.label}</h2>
        <p>현재 선택된 가구의 배치 정보입니다.</p>
      </div>

      <dl className="inspector-grid">
        <div>
          <dt>x</dt>
          <dd>{Math.round(item.x)}</dd>
        </div>
        <div>
          <dt>y</dt>
          <dd>{Math.round(item.y)}</dd>
        </div>
        <div>
          <dt>기본 크기</dt>
          <dd>
            {item.width} × {item.height}
          </dd>
        </div>
        <div>
          <dt>점유 크기</dt>
          <dd>
            {footprint.width} × {footprint.height}
          </dd>
        </div>
        <div>
          <dt>회전</dt>
          <dd>{item.rotation}°</dd>
        </div>
      </dl>

      <button type="button" className="primary-button" onClick={() => onRotate(item.id)}>
        90도 회전
      </button>
      {roomSizeSection}
      {savedLayoutsSection}
    </section>
  );
}
