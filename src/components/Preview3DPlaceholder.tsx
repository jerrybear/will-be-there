import type { PlacedFurniture, Room } from '../types/layout';

interface Preview3DPlaceholderProps {
  room: Room;
  items: PlacedFurniture[];
}

function getElementCount(items: PlacedFurniture[], kind: PlacedFurniture['kind']) {
  return items.filter((item) => item.kind === kind).length;
}

export function Preview3DPlaceholder({ room, items }: Preview3DPlaceholderProps) {
  const furnitureCount = getElementCount(items, 'furniture');
  const doorCount = getElementCount(items, 'door');
  const windowCount = getElementCount(items, 'window');

  return (
    <section className="panel preview-panel">
      <div className="panel-header">
        <h2>3D 미리보기</h2>
        <p>높이와 요소 종류를 가진 배치 데이터로 3D 화면을 연결할 준비 단계입니다.</p>
      </div>

      <div className="preview-shell">
        <div className="preview-room" aria-label="3D preview placeholder">
          <div className="preview-floor" />
          <div className="preview-wall preview-wall-back" />
          <div className="preview-wall preview-wall-side" />
        </div>

        <dl className="preview-stats">
          <div>
            <dt>방 크기</dt>
            <dd>
              {room.width} x {room.height}
            </dd>
          </div>
          <div>
            <dt>가구</dt>
            <dd>{furnitureCount}개</dd>
          </div>
          <div>
            <dt>문 / 창문</dt>
            <dd>
              {doorCount}개 / {windowCount}개
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
