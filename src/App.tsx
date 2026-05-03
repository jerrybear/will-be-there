import { FurniturePalette } from './components/FurniturePalette';
import { InspectorPanel } from './components/InspectorPanel';
import { RoomCanvas } from './components/RoomCanvas';
import { TopBar } from './components/TopBar';
import { useRoomLayout } from './state/useRoomLayout';

export default function App() {
  const {
    room,
    catalog,
    items,
    selectedId,
    selectedItem,
    savedLayouts,
    addFurniture,
    selectFurniture,
    moveFurniture,
    rotateFurniture,
    resetLayout,
    resizeRoom,
    saveLayout,
    loadLayout,
    deleteLayout,
  } = useRoomLayout();

  return (
    <div className="app-shell">
      <TopBar onReset={resetLayout} />

      <main className="workspace-grid">
        <FurniturePalette items={catalog} onAdd={addFurniture} />
        <RoomCanvas
          room={room}
          items={items}
          selectedId={selectedId}
          onSelect={selectFurniture}
          onMove={moveFurniture}
        />
        <InspectorPanel
          room={room}
          item={selectedItem}
          savedLayouts={savedLayouts}
          onRotate={rotateFurniture}
          onResizeRoom={resizeRoom}
          onSave={saveLayout}
          onLoad={loadLayout}
          onDelete={deleteLayout}
        />
      </main>
    </div>
  );
}
