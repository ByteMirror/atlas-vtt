import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GripHorizontal, SlidersHorizontal } from 'lucide-react';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { useDialogWindowVariants } from '../../packages/components/primitives/dialogMotion';
import { useAtlasStore } from '../../react/ViewStoreContext';
import { useDraggablePosition, type PanelArea, type PanelPosition } from '../../react/hooks/useDraggablePosition';
import {
  DEFAULT_EXPLORED_COLOR,
  DEFAULT_UNEXPLORED_COLOR,
  exploredMemoryOn,
  litThresholdOf,
  tokenVisionOn,
} from '../../lighting/sceneLightingOptions';
import { ColorField, SliderField, ToggleField } from './lightingPanelFields';

const MARGIN = 16;

/** First placement: the top right of the map, below the scene tabs, like the other map windows. */
const topRight = (area: PanelArea, panel: PanelArea): PanelPosition => ({ x: area.width - panel.width - MARGIN, y: 64 });

/** The scene lighting settings panel, while it is open. */
export function SceneLightingPanelHost(): React.ReactElement {
  const open = useAtlasStore((state) => state.isSceneLightingPanelOpen);
  return <AnimatePresence>{open && <SceneLightingPanel key="scene-lighting" />}</AnimatePresence>;
}

/** How the scene's lighting treats sight and memory. Changes apply at once and are never undo steps. */
function SceneLightingPanel(): React.ReactElement {
  const lighting = useAtlasStore((state) => state.lighting);
  const setSceneLighting = useAtlasStore((state) => state.setSceneLighting);
  const setOpen = useAtlasStore((state) => state.setSceneLightingPanelOpen);
  const windowVariants = useDialogWindowVariants();
  const { position, panelRef, startDrag, isDragging } = useDraggablePosition(topRight, { margin: MARGIN });
  // The value shows live while dragging and reaches the scene on release: every step would
  // rebuild sight and record explored memory, and a pass below the ambient level would record
  // everything in sight for good.
  const [dragged, setDragged] = useState<number | null>(null);
  const threshold = dragged ?? Math.round(litThresholdOf(lighting) * 100);

  return (
    <motion.section
      ref={panelRef}
      className={`atlas-light-panel${isDragging ? ' is-dragging' : ''}`}
      style={{ left: position.x, top: position.y }}
      variants={windowVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      aria-label="Lighting settings"
    >
      <header className="atlas-light-panel__header" onPointerDown={startDrag}>
        <GripHorizontal className="atlas-light-panel__grip" />
        <SlidersHorizontal className="atlas-light-panel__icon" />
        <h2 className="atlas-light-panel__title">Lighting settings</h2>
        <CloseButton onClick={() => setOpen(false)} aria-label="Close lighting settings" />
      </header>
      <div className="atlas-light-panel__body">
        <ToggleField
          label="Token vision"
          value={tokenVisionOn(lighting)}
          tooltipOn="Players see only what their tokens see"
          tooltipOff="Players see everything the light shows"
          onChange={(tokenVision) => setSceneLighting({ tokenVision })}
        />
        <ToggleField
          label="Remember explored areas"
          value={exploredMemoryOn(lighting)}
          tooltipOn="What tokens saw stays on the players' map"
          tooltipOff="Players see only what their tokens see now"
          onChange={(exploredMemory) => setSceneLighting({ exploredMemory })}
        />
        <div className="atlas-light-panel__row atlas-light-panel__row--pair">
          <ColorField label="Explored colour" value={lighting.exploredColor ?? DEFAULT_EXPLORED_COLOR}
            onChange={(exploredColor) => setSceneLighting({ exploredColor })} />
          <ColorField label="Unexplored colour" value={lighting.unexploredColor ?? DEFAULT_UNEXPLORED_COLOR}
            onChange={(unexploredColor) => setSceneLighting({ unexploredColor })} />
        </div>
        <SliderField label="Counts as lit from" value={threshold} min={0} max={100} step={1} display={`${threshold} %`}
          onChange={setDragged}
          onCommit={(percent) => {
            setDragged(null);
            setSceneLighting({ litThreshold: percent / 100 });
          }} />
      </div>
    </motion.section>
  );
}
