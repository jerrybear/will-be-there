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
    currentLayout,
    hasUnsavedChanges,
    overlappingItemIds,
    snapSize,
    savedLayouts,
    canUndo,
    canRedo,
    addFurniture,
    selectFurniture,
    beginFurnitureMove,
    moveFurniture,
    updateFurnitureGeometry,
    renameFurniture,
    rotateFurniture,
    updateDoorSwing,
    duplicateFurniture,
    deleteFurniture,
    setSnapSize,
    resetLayout,
    resizeRoom,
    saveLayout,
    loadLayout,
    deleteLayout,
    updateLayoutMeta,
    updateCurrentLayout,
    undoLayoutChange,
    redoLayoutChange,
  } = useRoomLayout();

  return (
    <div className="app-shell">
      <TopBar
        savedLayouts={savedLayouts}
        currentLayoutId={currentLayout?.id ?? null}
        hasUnsavedChanges={hasUnsavedChanges}
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
          overlappingItemIds={overlappingItemIds}
          onSelect={selectFurniture}
          onMoveStart={beginFurnitureMove}
          onMove={moveFurniture}
        />
        <InspectorPanel
          room={room}
          item={selectedItem}
          isOverlapping={selectedItem ? overlappingItemIds.has(selectedItem.id) : false}
          snapSize={snapSize}
          savedLayouts={savedLayouts}
          onRotate={rotateFurniture}
          onRename={renameFurniture}
          onUpdateDoorSwing={updateDoorSwing}
          onDuplicate={duplicateFurniture}
          onDeleteFurniture={deleteFurniture}
          onUpdateFurniture={updateFurnitureGeometry}
          onSnapSizeChange={setSnapSize}
          onResizeRoom={resizeRoom}
          onSave={saveLayout}
          currentLayoutId={currentLayout?.id ?? null}
          hasUnsavedChanges={hasUnsavedChanges}
          onUpdateCurrentLayout={updateCurrentLayout}
        />
      </main>
    </div>
  );
}
