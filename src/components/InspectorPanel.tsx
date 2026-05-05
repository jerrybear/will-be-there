import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { FurnitureGeometryUpdate, PlacedFurniture } from '../types/layout';
import type { Room } from '../types/layout';
import type { RoomObstacle, RoomShapePreset } from '../types/layout';
import type { SavedLayout } from '../types/layout';
import type { SavedRoom } from '../types/layout';
import type { SnapSize } from '../types/layout';
import { getRotatedSize } from '../types/layout';
import { getRoomShape } from '../utils/geometry';

interface InspectorPanelProps {
  room: Room;
  item: PlacedFurniture | null;
  isOverlapping: boolean;
  isRoomEditingEnabled: boolean;
  snapSize: SnapSize;
  savedRooms: SavedRoom[];
  savedLayouts: SavedLayout[];
  currentRoom: SavedRoom | null;
  onRotate: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onUpdateDoorSwing: (id: string, updates: Partial<Pick<PlacedFurniture, 'doorHinge' | 'doorSwingDir' | 'showDoorSwing'>>) => void;
  onDuplicate: (id: string) => void;
  onDeleteFurniture: (id: string) => void;
  onRoomEditingChange: (enabled: boolean) => void;
  onUpdateFurniture: (id: string, update: FurnitureGeometryUpdate) => void;
  onSnapSizeChange: (snapSize: SnapSize) => void;
  onResizeRoom: (width: number, height: number) => void;
  onApplyRoomShapePreset: (preset: RoomShapePreset) => void;
  onAddPillar: () => void;
  onDeleteRoomObstacle: (id: string) => void;
  onUpdateRoomObstacle: (id: string, update: Partial<Extract<RoomObstacle, { type: 'rect' }>>) => void;
  onSaveRoom: (name: string, memo: string) => string | null;
  onLoadRoom: (id: string) => void;
  onDeleteRoom: (id: string) => void;
  onUpdateCurrentRoom: () => void;
  onSave: (name: string, memo: string) => void;
  currentRoomId: string | null;
  currentLayoutId: string | null;
  hasUnsavedChanges: boolean;
  hasUnsavedRoomChanges: boolean;
  onUpdateCurrentLayout: () => void;
}

function formatSavedTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function hasValidNumberDraft(values: string[]) {
  return values.every((value) => {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) && parsedValue >= 0;
  });
}

function formatElementKind(kind: PlacedFurniture['kind']) {
  if (kind === 'door') {
    return '문';
  }

  if (kind === 'window') {
    return '창문';
  }

  return '가구';
}

export function InspectorPanel({
  room,
  item,
  isOverlapping,
  isRoomEditingEnabled,
  snapSize,
  savedRooms,
  savedLayouts,
  currentRoom,
  onRotate,
  onRename,
  onUpdateDoorSwing,
  onDuplicate,
  onDeleteFurniture,
  onRoomEditingChange,
  onUpdateFurniture,
  onSnapSizeChange,
  onResizeRoom,
  onApplyRoomShapePreset,
  onAddPillar,
  onDeleteRoomObstacle,
  onUpdateRoomObstacle,
  onSaveRoom,
  onLoadRoom,
  onDeleteRoom,
  onUpdateCurrentRoom,
  onSave,
  currentRoomId,
  currentLayoutId,
  hasUnsavedChanges,
  hasUnsavedRoomChanges,
  onUpdateCurrentLayout,
}: InspectorPanelProps) {
  const [layoutName, setLayoutName] = useState('');
  const [layoutMemo, setLayoutMemo] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomMemo, setRoomMemo] = useState('');
  const [roomDraft, setRoomDraft] = useState({
    width: String(room.width),
    height: String(room.height),
  });
  const [furnitureDraft, setFurnitureDraft] = useState({
    x: '',
    y: '',
    width: '',
    height: '',
  });
  const [labelDraft, setLabelDraft] = useState('');

  useEffect(() => {
    setRoomDraft({
      width: String(room.width),
      height: String(room.height),
    });
  }, [room.width, room.height]);

  useEffect(() => {
    if (!item) {
      setFurnitureDraft({
        x: '',
        y: '',
        width: '',
        height: '',
      });
      setLabelDraft('');
      return;
    }

    setFurnitureDraft({
      x: String(Math.round(item.x)),
      y: String(Math.round(item.y)),
      width: String(Math.round(item.width)),
      height: String(Math.round(item.height)),
    });
    setLabelDraft(item.label);
  }, [item?.id, item?.x, item?.y, item?.width, item?.height]);

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(layoutName, layoutMemo);
    setLayoutName('');
    setLayoutMemo('');
  };

  const handleRoomSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const savedRoomId = onSaveRoom(roomName, roomMemo);

    if (savedRoomId) {
      setRoomName('');
      setRoomMemo('');
    }
  };

  const draftWidth = Number(roomDraft.width);
  const draftHeight = Number(roomDraft.height);
  const hasValidRoomDraft = Number.isFinite(draftWidth) && Number.isFinite(draftHeight) && draftWidth > 0 && draftHeight > 0;
  const hasRoomChanges = draftWidth !== room.width || draftHeight !== room.height;
  const hasValidFurnitureDraft = hasValidNumberDraft([
    furnitureDraft.x,
    furnitureDraft.y,
    furnitureDraft.width,
    furnitureDraft.height,
  ]) && Number(furnitureDraft.width) > 0 && Number(furnitureDraft.height) > 0;
  const hasFurnitureChanges = !!item && (
    Number(furnitureDraft.x) !== Math.round(item.x) ||
    Number(furnitureDraft.y) !== Math.round(item.y) ||
    Number(furnitureDraft.width) !== Math.round(item.width) ||
    Number(furnitureDraft.height) !== Math.round(item.height)
  );

  const handleRoomSizeApply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!hasValidRoomDraft) {
      return;
    }

    onResizeRoom(draftWidth, draftHeight);
  };

  const handleFurnitureApply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!item || !hasValidFurnitureDraft) {
      return;
    }

    onUpdateFurniture(item.id, {
      x: Number(furnitureDraft.x),
      y: Number(furnitureDraft.y),
      width: Number(furnitureDraft.width),
      height: Number(furnitureDraft.height),
    });
  };

  const handleObstacleApply = (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const x = Number(formData.get('x'));
    const y = Number(formData.get('y'));
    const width = Number(formData.get('width'));
    const height = Number(formData.get('height'));

    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      return;
    }

    onUpdateRoomObstacle(id, { x, y, width, height });
  };

  const handleRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!item || !labelDraft.trim() || labelDraft.trim() === item.label) {
      return;
    }

    onRename(item.id, labelDraft);
  };

  const snapSection = (
    <div className="snap-editor">
      <h3>스냅</h3>
      <label>
        <span>이동/입력 단위</span>
        <select value={snapSize} onChange={(event) => onSnapSizeChange(Number(event.target.value) as SnapSize)}>
          <option value={0}>없음</option>
          <option value={10}>10px</option>
          <option value={24}>24px 그리드</option>
        </select>
      </label>
    </div>
  );

  const currentLayout = savedLayouts.find((l) => l.id === currentLayoutId);
  const roomShape = getRoomShape(room);
  const roomLayouts = currentRoomId ? savedLayouts.filter((layout) => layout.roomId === currentRoomId) : savedLayouts;

  const savedRoomsSection = (
    <div className="saved-layouts room-library">
      {currentRoomId && currentRoom ? (
        <div className="active-layout-section">
          <h3>
            현재 방: {currentRoom.name}
            {hasUnsavedRoomChanges ? ' · 수정됨' : ''}
          </h3>
          {currentRoom.memo && <p className="layout-memo">{currentRoom.memo}</p>}
          <button type="button" className="primary-button update-button" onClick={onUpdateCurrentRoom} disabled={!hasUnsavedRoomChanges}>
            현재 방에 덮어쓰기
          </button>
          <hr className="section-divider" />
          <h3>새 방으로 저장</h3>
        </div>
      ) : (
        <h3>방 저장</h3>
      )}
      <form className="save-form" onSubmit={handleRoomSave}>
        <input
          type="text"
          value={roomName}
          onChange={(event) => setRoomName(event.target.value)}
          placeholder="방 이름"
          aria-label="방 이름"
        />
        <textarea
          value={roomMemo}
          onChange={(event) => setRoomMemo(event.target.value)}
          placeholder="방 메모 (선택 사항)"
          aria-label="방 메모"
          rows={2}
          className="memo-input"
        />
        <button type="submit" className="ghost-button compact-button" disabled={!roomName.trim()}>
          방 저장
        </button>
      </form>
      {savedRooms.length > 0 && (
        <div className="saved-layout-list">
          {savedRooms.map((savedRoom) => (
            <article key={savedRoom.id} className={`saved-layout-card ${savedRoom.id === currentRoomId ? 'is-active' : ''}`}>
              <div className="layout-info">
                <strong>{savedRoom.name}</strong>
                {savedRoom.memo && <p className="layout-memo">{savedRoom.memo}</p>}
                <span>{formatSavedTime(savedRoom.updatedAt)}</span>
              </div>
              <div className="saved-layout-actions">
                <button type="button" className="ghost-button compact-button" onClick={() => onLoadRoom(savedRoom.id)}>
                  불러오기
                </button>
                <button type="button" className="ghost-button compact-button danger-button" onClick={() => onDeleteRoom(savedRoom.id)}>
                  삭제
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );

  const savedLayoutsSection = (
    <div className="saved-layouts">
      {currentLayoutId && currentLayout ? (
        <div className="active-layout-section">
          <h3>
            현재 작업 중: {currentLayout.name}
            {hasUnsavedChanges ? ' · 수정됨' : ''}
          </h3>
          {currentLayout.memo && <p className="layout-memo">{currentLayout.memo}</p>}
          <button type="button" className="primary-button update-button" onClick={onUpdateCurrentLayout} disabled={!hasUnsavedChanges}>
            현재 도면에 덮어쓰기
          </button>
          
          <hr className="section-divider" />
          
          <h3>새로운 도면으로 복사</h3>
          <form className="save-form" onSubmit={handleSave}>
            <input
              type="text"
              value={layoutName}
              onChange={(event) => setLayoutName(event.target.value)}
              placeholder="새 도면 이름"
              aria-label="새 도면 이름"
            />
            <textarea
              value={layoutMemo}
              onChange={(event) => setLayoutMemo(event.target.value)}
              placeholder="새 메모 (선택 사항)"
              aria-label="새 도면 메모"
              rows={2}
              className="memo-input"
            />
            <button type="submit" className="ghost-button compact-button" disabled={!layoutName.trim()}>
              복사로 저장
            </button>
          </form>
        </div>
      ) : (
        <div className="new-layout-section">
          <h3>{currentRoom ? `${currentRoom.name} 도면 저장` : '새 도면 저장'}</h3>
          <form className="save-form" onSubmit={handleSave}>
            <input
              type="text"
              value={layoutName}
              onChange={(event) => setLayoutName(event.target.value)}
              placeholder="저장안 이름 (예: 침실 배치 1)"
              aria-label="저장안 이름"
            />
            <textarea
              value={layoutMemo}
              onChange={(event) => setLayoutMemo(event.target.value)}
              placeholder="간단한 메모 (선택 사항)"
              aria-label="저장안 메모"
              rows={2}
              className="memo-input"
            />
            <button type="submit" className="primary-button compact-button save-button" disabled={!layoutName.trim()}>
              저장
            </button>
          </form>
        </div>
      )}
      {roomLayouts.length > 0 && (
        <div className="saved-layout-list">
          {roomLayouts.map((layout) => (
            <article key={layout.id} className={`saved-layout-card ${layout.id === currentLayoutId ? 'is-active' : ''}`}>
              <div className="layout-info">
                <strong>
                  {layout.name}
                  {layout.id === currentLayoutId && hasUnsavedChanges ? ' · 수정됨' : ''}
                </strong>
                {layout.memo && <p className="layout-memo">{layout.memo}</p>}
                <span>{layout.items.length}개 요소 · {formatSavedTime(layout.updatedAt)}</span>
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

  const roomShapeSection = (
    <div className="room-shape-editor">
      <h3>방 형태</h3>
      <label className="toggle-label room-edit-toggle">
        <input
          type="checkbox"
          checked={isRoomEditingEnabled}
          onChange={(event) => onRoomEditingChange(event.target.checked)}
        />
        <span>방 편집</span>
      </label>
      {isRoomEditingEnabled && (
        <>
          <div className="shape-preset-grid">
            <button type="button" className="ghost-button compact-button" onClick={() => onApplyRoomShapePreset('rect')}>
              직사각형
            </button>
            <button type="button" className="ghost-button compact-button" onClick={() => onApplyRoomShapePreset('l-shape')}>
              ㄱ자
            </button>
            <button type="button" className="ghost-button compact-button" onClick={() => onApplyRoomShapePreset('bay')}>
              튀어나온 면
            </button>
            <button type="button" className="ghost-button compact-button" onClick={() => onApplyRoomShapePreset('diagonal')}>
              사선
            </button>
          </div>
          <button type="button" className="ghost-button compact-button" onClick={onAddPillar}>
            기둥 추가
          </button>
        </>
      )}
      {roomShape.obstacles.length > 0 ? (
        <div className="obstacle-list">
          {roomShape.obstacles.map((obstacle) => (
            <form key={obstacle.id} className="obstacle-row" onSubmit={(event) => handleObstacleApply(event, obstacle.id)}>
              <div className="obstacle-title">
                <strong>{obstacle.label}</strong>
                {obstacle.type === 'rect' && (
                  <div className="obstacle-fields">
                    <label>
                      <span>x</span>
                      <input name="x" type="number" min="0" step="1" defaultValue={Math.round(obstacle.x)} />
                    </label>
                    <label>
                      <span>y</span>
                      <input name="y" type="number" min="0" step="1" defaultValue={Math.round(obstacle.y)} />
                    </label>
                    <label>
                      <span>폭</span>
                      <input name="width" type="number" min="20" step="1" defaultValue={Math.round(obstacle.width)} />
                    </label>
                    <label>
                      <span>높이</span>
                      <input name="height" type="number" min="20" step="1" defaultValue={Math.round(obstacle.height)} />
                    </label>
                  </div>
                )}
              </div>
              <div className="obstacle-actions">
                <button type="submit" className="ghost-button compact-button" disabled={!isRoomEditingEnabled}>
                  적용
                </button>
                <button
                  type="button"
                  className="ghost-button compact-button danger-button"
                  onClick={() => onDeleteRoomObstacle(obstacle.id)}
                  disabled={!isRoomEditingEnabled}
                >
                  삭제
                </button>
              </div>
            </form>
          ))}
        </div>
      ) : (
        <p>방 안의 배치 불가 영역이 없습니다.</p>
      )}
    </div>
  );

  if (!item) {
    return (
      <section className="panel inspector-panel">
        <div className="panel-header">
          <h2>선택 가구</h2>
          <p>방 안의 가구를 클릭하면 상세 정보가 보입니다.</p>
        </div>
        {snapSection}
        {roomSizeSection}
        {roomShapeSection}
        {savedRoomsSection}
        <div className="empty-state">아직 선택된 가구가 없습니다.</div>
        {savedLayoutsSection}
      </section>
    );
  }

  const footprint = getRotatedSize(item);
  const labelEditorSection = (
    <form className="label-editor-form" onSubmit={handleRename}>
      <label>
        <span>이름</span>
        <input
          type="text"
          value={labelDraft}
          onChange={(event) => setLabelDraft(event.target.value)}
          aria-label="선택 요소 이름"
        />
      </label>
      <button type="submit" className="primary-button compact-button" disabled={!labelDraft.trim() || labelDraft.trim() === item.label}>
        이름 변경
      </button>
    </form>
  );
  const furnitureGeometrySection = (
    <form className="furniture-geometry-form" onSubmit={handleFurnitureApply}>
      <div className="dimension-fields">
        <label>
          <span>x</span>
          <input
            type="number"
            min="0"
            step="1"
            value={furnitureDraft.x}
            onChange={(event) => setFurnitureDraft((currentDraft) => ({ ...currentDraft, x: event.target.value }))}
          />
        </label>
        <label>
          <span>y</span>
          <input
            type="number"
            min="0"
            step="1"
            value={furnitureDraft.y}
            onChange={(event) => setFurnitureDraft((currentDraft) => ({ ...currentDraft, y: event.target.value }))}
          />
        </label>
        <label>
          <span>폭</span>
          <input
            type="number"
            min="20"
            step="1"
            value={furnitureDraft.width}
            onChange={(event) => setFurnitureDraft((currentDraft) => ({ ...currentDraft, width: event.target.value }))}
          />
        </label>
        <label>
          <span>높이</span>
          <input
            type="number"
            min="20"
            step="1"
            value={furnitureDraft.height}
            onChange={(event) => setFurnitureDraft((currentDraft) => ({ ...currentDraft, height: event.target.value }))}
          />
        </label>
      </div>
      <button type="submit" className="primary-button compact-button" disabled={!hasValidFurnitureDraft || !hasFurnitureChanges}>
        적용
      </button>
    </form>
  );

  return (
    <section className="panel inspector-panel">
      <div className="panel-header">
        <h2>{item.label}</h2>
        {isOverlapping ? (
          <div className="overlap-warning">
            ⚠️ 다른 가구와 겹쳐 있습니다
          </div>
        ) : (
          <p>현재 선택된 가구의 배치 정보입니다.</p>
        )}
      </div>

      {snapSection}

      <div className="label-editor">
        <h3>이름</h3>
        {labelEditorSection}
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
        <div>
          <dt>요소 종류</dt>
          <dd>{formatElementKind(item.kind)}</dd>
        </div>
        <div>
          <dt>3D 높이</dt>
          <dd>{item.objectHeight}</dd>
        </div>
        <div>
          <dt>바닥 높이</dt>
          <dd>{item.elevation}</dd>
        </div>
      </dl>

      <div className="furniture-editor">
        <h3>위치/크기</h3>
        {furnitureGeometrySection}
      </div>

      <button type="button" className="primary-button" onClick={() => onRotate(item.id)}>
        90도 회전
      </button>
      
      {item.templateId === 'door' && (
        <div className="door-options-panel">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={!!item.showDoorSwing}
              onChange={(e) => {
                onUpdateDoorSwing(item.id, {
                  showDoorSwing: e.target.checked,
                  doorHinge: item.doorHinge || 'left',
                  doorSwingDir: item.doorSwingDir || 'front',
                });
              }}
            />
            <span>스윙 영역 표시</span>
          </label>
          {item.showDoorSwing && (
            <div className="door-swing-controls">
              <div className="control-group">
                <span>경첩</span>
                <div className="segment-control">
                  <button
                    type="button"
                    className={item.doorHinge === 'left' ? 'active' : ''}
                    onClick={() => onUpdateDoorSwing(item.id, { doorHinge: 'left' })}
                  >
                    왼쪽
                  </button>
                  <button
                    type="button"
                    className={item.doorHinge === 'right' ? 'active' : ''}
                    onClick={() => onUpdateDoorSwing(item.id, { doorHinge: 'right' })}
                  >
                    오른쪽
                  </button>
                </div>
              </div>
              <div className="control-group">
                <span>방향</span>
                <div className="segment-control">
                  <button
                    type="button"
                    className={item.doorSwingDir === 'front' ? 'active' : ''}
                    onClick={() => onUpdateDoorSwing(item.id, { doorSwingDir: 'front' })}
                  >
                    앞쪽
                  </button>
                  <button
                    type="button"
                    className={item.doorSwingDir === 'back' ? 'active' : ''}
                    onClick={() => onUpdateDoorSwing(item.id, { doorSwingDir: 'back' })}
                  >
                    뒤쪽
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="furniture-actions">
        <button type="button" className="ghost-button" onClick={() => onDuplicate(item.id)}>
          복제
        </button>
        <button type="button" className="ghost-button danger-button" onClick={() => onDeleteFurniture(item.id)}>
          삭제
        </button>
      </div>
      {roomSizeSection}
      {roomShapeSection}
      {savedRoomsSection}
      {savedLayoutsSection}
    </section>
  );
}
