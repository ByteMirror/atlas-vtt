import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { useViewStoreHook } from '../ViewStoreContext';
import { useMapHotkeys, useHotkeyLabels } from '../../keyboard/useMapHotkeys';
import { ToolButton } from '../../packages/components/primitives/ToolButton';
import { TooltipProvider } from '../../packages/components/primitives/tooltip';
import { getHistoryStore } from '../../stores/history';

interface UndoRedoControlsProps {
  viewId?: string;
}

export const UndoRedoControls: React.FC<UndoRedoControlsProps> = ({ viewId }): React.ReactElement => {
  const store = useViewStoreHook();
  const history = useMemo(() => (store ? getHistoryStore(store) : null), [store]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    if (!history) return;

    const updateState = (): void => {
      const { pastStates, futureStates } = history.getState();
      setCanUndo(pastStates.length > 0);
      setCanRedo(futureStates.length > 0);
    };

    updateState();
    return history.subscribe(updateState);
  }, [history]);

  const handleUndo = useCallback((): void => {
    history?.getState().undo();
  }, [history]);

  const handleRedo = useCallback((): void => {
    history?.getState().redo();
  }, [history]);

  useMapHotkeys({ undo: handleUndo, redo: handleRedo, redoAlt: handleRedo }, viewId);
  const hotkeyLabel = useHotkeyLabels();

  return (
    <TooltipProvider delayDuration={300}>
      <div className="atlas-vtt-toolbar atlas-undo-redo-controls pointer-events-auto">
        <ToolButton
          icon={Undo2}
          label="Undo"
          shortcut={hotkeyLabel('undo')}
          isActive={false}
          disabled={!canUndo || !store}
          onClick={handleUndo}
        />
        <ToolButton
          icon={Redo2}
          label="Redo"
          shortcut={hotkeyLabel('redo')}
          isActive={false}
          disabled={!canRedo || !store}
          onClick={handleRedo}
        />
      </div>
    </TooltipProvider>
  );
};
