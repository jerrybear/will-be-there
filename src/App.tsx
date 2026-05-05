import { lazy, Suspense, useState } from 'react';
import { FurniturePalette } from './components/FurniturePalette';
import { InspectorPanel } from './components/InspectorPanel';
import { RoomCanvas } from './components/RoomCanvas';
import { TopBar } from './components/TopBar';
import { useRoomLayout } from './state/useRoomLayout';
import type { ViewMode } from './types/layout';

const Preview3DScene = lazy(() =>
  import('./components/Preview3DScene').then((module) => ({ default: module.Preview3DScene })),
);

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [isRoomEditingEnabled, setIsRoomEditingEnabled] = useState(false);
  const {
    room,
    catalog,
    items,
    selectedId,
    selectedItem,
    currentLayout,
    currentRoom,
    hasUnsavedChanges,
    hasUnsavedRoomChanges,
    overlappingItemIds,
    isSelfIntersecting,
    snapSize,
    savedRooms,
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
    applyRoomShapePreset,
    applyRoomJson,
    beginRoomShapeEdit,
    moveRoomPoint,
    addRoomPoint,
    deleteRoomPoint,
    addPillar,
    deleteRoomObstacle,
    updateRoomObstacle,
    saveRoom,
    loadRoom,
    deleteRoom,
    updateCurrentRoom,
    saveLayout,
    loadLayout,
    deleteLayout,
    updateLayoutMeta,
    updateCurrentLayout,
    currentRoomId,
    undoLayoutChange,
    redoLayoutChange,
  } = useRoomLayout();

  return (
    <div className="app-shell">
      <TopBar
        viewMode={viewMode}
        savedLayouts={savedLayouts}
        currentLayoutId={currentLayout?.id ?? null}
        hasUnsavedChanges={hasUnsavedChanges}
        canUndo={canUndo}
        canRedo={canRedo}
        onReset={resetLayout}
        onViewModeChange={setViewMode}
        onUndo={undoLayoutChange}
        onRedo={redoLayoutChange}
        onLoad={loadLayout}
        onDelete={deleteLayout}
        onUpdateMeta={updateLayoutMeta}
      />

      <main className="workspace-grid">
        <FurniturePalette items={catalog} onAdd={addFurniture} />
        {viewMode === '2d' ? (
          <RoomCanvas
            room={room}
            items={items}
            selectedId={selectedId}
            isRoomEditingEnabled={isRoomEditingEnabled}
            isSelfIntersecting={isSelfIntersecting}
            snapSize={snapSize}
            overlappingItemIds={overlappingItemIds}
            onSelect={selectFurniture}
            onMoveStart={beginFurnitureMove}
            onMove={moveFurniture}
            onRoomPointMoveStart={beginRoomShapeEdit}
            onRoomPointMove={moveRoomPoint}
            onRoomPointAdd={addRoomPoint}
            onRoomPointDelete={deleteRoomPoint}
          />
        ) : (
          <Suspense fallback={<section className="panel preview-panel" />}>
            <Preview3DScene room={room} items={items} />
          </Suspense>
        )}
        <InspectorPanel
          room={room}
          item={selectedItem}
          isOverlapping={selectedItem ? overlappingItemIds.has(selectedItem.id) : false}
          isRoomEditingEnabled={isRoomEditingEnabled}
          snapSize={snapSize}
          savedRooms={savedRooms}
          savedLayouts={savedLayouts}
          currentRoom={currentRoom}
          onRotate={rotateFurniture}
          onRename={renameFurniture}
          onUpdateDoorSwing={updateDoorSwing}
          onDuplicate={duplicateFurniture}
          onDeleteFurniture={deleteFurniture}
          onRoomEditingChange={setIsRoomEditingEnabled}
          onUpdateFurniture={updateFurnitureGeometry}
          onSnapSizeChange={setSnapSize}
          onResizeRoom={resizeRoom}
          onApplyRoomShapePreset={applyRoomShapePreset}
          onApplyRoomJson={applyRoomJson}
          onAddPillar={addPillar}
          onDeleteRoomObstacle={deleteRoomObstacle}
          onUpdateRoomObstacle={updateRoomObstacle}
          onSaveRoom={saveRoom}
          onLoadRoom={loadRoom}
          onDeleteRoom={deleteRoom}
          onUpdateCurrentRoom={updateCurrentRoom}
          onSave={saveLayout}
          currentRoomId={currentRoomId}
          currentLayoutId={currentLayout?.id ?? null}
          hasUnsavedChanges={hasUnsavedChanges}
          hasUnsavedRoomChanges={hasUnsavedRoomChanges}
          onUpdateCurrentLayout={updateCurrentLayout}
        />
      </main>
    </div>
  );
}
