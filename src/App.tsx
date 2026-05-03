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
    canUndo,
    canRedo,
    addFurniture,
    selectFurniture,
    beginFurnitureMove,
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
    undoLayoutChange,
    redoLayoutChange,
  } = useRoomLayout();

  return (
    <div className="app-shell">
      <TopBar
        savedLayouts={savedLayouts}
        currentLayoutId={currentLayoutId}
        canUndo={canUndo}
        canRedo={canRedo}
        onReset={resetLayout}
        onUndo={undoLayoutChange}
        onRedo={redoLayoutChange}
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
          onMoveStart={beginFurnitureMove}
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
