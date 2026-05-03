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
    duplicateFurniture,
    deleteFurniture,
    setSnapSize,
    resetLayout,
    resizeRoom,
    saveLayout,
    loadLayout,
    deleteLayout,
    updateLayoutMeta,
    currentLayoutId,
    updateCurrentLayout,
  } = useRoomLayout();

  return (
    <div className="app-shell">
      <TopBar
        savedLayouts={savedLayouts}
        currentLayoutId={currentLayoutId}
        onReset={resetLayout}
        onLoad={loadLayout}
        onDelete={deleteLayout}
        onUpdateMeta={updateLayoutMeta}
      />

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
          onDuplicate={duplicateFurniture}
          onDeleteFurniture={deleteFurniture}
          onUpdateFurniture={updateFurnitureGeometry}
          onSnapSizeChange={setSnapSize}
          onResizeRoom={resizeRoom}
          onSave={saveLayout}
          currentLayoutId={currentLayoutId}
          onUpdateCurrentLayout={updateCurrentLayout}
        />
      </main>
    </div>
  );
}
