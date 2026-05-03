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
    snapSize,
    savedLayouts,
    addFurniture,
    selectFurniture,
    moveFurniture,
    updateFurnitureGeometry,
    rotateFurniture,
    setSnapSize,
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
          snapSize={snapSize}
          savedLayouts={savedLayouts}
          onRotate={rotateFurniture}
          onUpdateFurniture={updateFurnitureGeometry}
          onSnapSizeChange={setSnapSize}
          onResizeRoom={resizeRoom}
          onSave={saveLayout}
          onLoad={loadLayout}
          onDelete={deleteLayout}
        />
      </main>
    </div>
  );
}
