import { lazy, Suspense, useEffect, useState } from 'react';
import { FurniturePalette } from './components/FurniturePalette';
import { InspectorPanel } from './components/InspectorPanel';
import { RoomCanvas } from './components/RoomCanvas';
import { TopBar } from './components/TopBar';
import { useRoomLayout } from './state/useRoomLayout';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import type { ViewMode } from './types/layout';

const Preview3DScene = lazy(() =>
  import('./components/Preview3DScene').then((module) => ({ default: module.Preview3DScene })),
);

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [isRoomEditingEnabled, setIsRoomEditingEnabled] = useState(false);
  const [shareStatusMessage, setShareStatusMessage] = useState<string | null>(null);
  const {
    room,
    catalog,
    items,
    notes,
    selectedId,
    selectedItem,
    currentLayout,
    currentRoom,
    currentLayoutName,
    sharedLayoutError,
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
    addCustomFurnitureTemplate,
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
    addNote,
    updateNote,
    beginNoteMove,
    deleteNote,
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
    copyFurniture,
    pasteFurniture,
    buildShareLink,
    clearSharedLayoutError,
  } = useRoomLayout();

  useEffect(() => {
    if (!sharedLayoutError) {
      return;
    }

    setShareStatusMessage(sharedLayoutError);
    clearSharedLayoutError();
  }, [clearSharedLayoutError, sharedLayoutError]);

  useEffect(() => {
    if (!shareStatusMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShareStatusMessage(null);
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [shareStatusMessage]);

  const handleCopyShareLink = async () => {
    try {
      const shareUrl = buildShareLink();

      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        setShareStatusMessage('클립보드 복사를 지원하지 않는 환경입니다.');
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      setShareStatusMessage('공유 링크를 복사했습니다.');
    } catch {
      setShareStatusMessage('공유 링크를 만들지 못했습니다.');
    }
  };

  useKeyboardShortcuts({
    selectedId,
    selectedItem,
    snapSize,
    onSelect: selectFurniture,
    onDelete: deleteFurniture,
    onCopy: copyFurniture,
    onPaste: pasteFurniture,
    onMove: moveFurniture,
    onRotate: rotateFurniture,
    onUndo: undoLayoutChange,
    onRedo: redoLayoutChange,
    onSnapSizeChange: setSnapSize,
    isRoomEditingEnabled,
  });

  return (
    <div className="app-shell">
      <TopBar
        viewMode={viewMode}
        savedLayouts={savedLayouts}
        currentLayoutId={currentLayout?.id ?? null}
        currentLayoutName={currentLayoutName}
        shareStatusMessage={shareStatusMessage}
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
        onSaveCurrent={updateCurrentLayout}
        onCopyShareLink={handleCopyShareLink}
      />

      <main className="workspace-grid">
        <FurniturePalette items={catalog} onAdd={addFurniture} onAddCustomItem={addCustomFurnitureTemplate} />
        {viewMode === '2d' ? (
          <RoomCanvas
            room={room}
            items={items}
            notes={notes}
            selectedId={selectedId}
            isRoomEditingEnabled={isRoomEditingEnabled}
            isSelfIntersecting={isSelfIntersecting}
            snapSize={snapSize}
            overlappingItemIds={overlappingItemIds}
            onSelect={selectFurniture}
            onMoveStart={beginFurnitureMove}
            onMove={moveFurniture}
            onRoomEditingChange={setIsRoomEditingEnabled}
            onRoomPointMoveStart={beginRoomShapeEdit}
            onRoomPointMove={moveRoomPoint}
            onRoomPointAdd={addRoomPoint}
            onRoomPointDelete={deleteRoomPoint}
            onAddNote={addNote}
            onNoteMoveStart={beginNoteMove}
            onUpdateNote={updateNote}
            onDeleteNote={deleteNote}
          />
        ) : (
          <Suspense fallback={<section className="panel preview-panel" />}>
            <Preview3DScene room={room} items={items} selectedId={selectedId} />
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
