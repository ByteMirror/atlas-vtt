import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GripHorizontal } from 'lucide-react';
import { Notice, type App } from 'obsidian';
import { CoinIcon } from '../CoinIcon';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { useDialogWindowVariants } from '../../../packages/components/primitives/dialogMotion';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore } from '../../ViewStoreContext';
import { useMapCollectionId } from '../../hooks/useMapCollectionId';
import { useDraggablePosition, type PanelArea, type PanelPosition } from '../../hooks/useDraggablePosition';
import { usePanelResize } from '../../hooks/usePanelResize';
import { countByRarity, countDrawable, rollLoot, type LootDraw } from '../../../loot/lootRoller';
import { LootHistoryStore } from '../../../loot/LootHistoryStore';
import { baseName } from '../../../utils/pathUtils';
import { runInBackground } from '../../../utils/backgroundTask';
import { useCollectionLoot, useLootBases } from './useLootBases';
import { useLootHistory } from './useLootHistory';
import { usePlayerLootIds } from './usePlayerLoot';
import { PlayerLootDisplay } from '../../../services/PlayerLootDisplay';
import { LootSourceTree } from './LootSourceTree';
import { LootRollBar } from './LootRollBar';
import { LootPaneTabs } from './LootPaneTabs';
import { LootHistory, LootResults } from './LootLists';
import { LootEmptyState } from './LootEmptyState';
import { LootRollerTutorials } from './LootRollerTutorials';
import { CollectionSettingsModal } from '../CollectionSettingsModal';
import { t } from '../../../i18n';

const MARGIN = 12;
/** Small enough for a laptop map view, big enough for the source list and one column of cards. */
const MIN_SIZE = { width: 620, height: 420 };

/** First placement: the top right of the map, below the scene tabs. */
const topRight = (area: PanelArea, panel: PanelArea): PanelPosition => ({ x: area.width - panel.width - MARGIN, y: 64 });

function openLink(app: App, link: string): void {
  runInBackground(app.workspace.openLinkText(link, '', true), `Opening ${link}`, t('loot.openFailed'));
}

function openItemNote(app: App, draw: LootDraw): void {
  const note = app.vault.getFileByPath(draw.notePath);
  if (!note) {
    new Notice(t('loot.noteGone', { name: draw.name }));
    return;
  }
  runInBackground(app.workspace.getLeaf('tab').openFile(note), `Opening ${note.path}`, t('loot.openFailed'));
}

/** The loot roller window of the map view; shown for the DM while it is open. */
export function LootRoller(): React.ReactElement {
  const open = useAtlasStore((state) => state.lootRoller.open);
  return <AnimatePresence>{open && <LootRollerPanel key="loot-roller" />}</AnimatePresence>;
}

function LootRollerPanel(): React.ReactElement {
  const { app } = useAtlasUI();
  const collectionId = useMapCollectionId();
  const mapPath = useAtlasStore((s) => s.mapPath);
  const state = useAtlasStore((s) => s.lootRoller);
  const setOpen = useAtlasStore((s) => s.setLootRollerOpen);
  const update = useAtlasStore((s) => s.updateLootRoller);
  const showRoll = useAtlasStore((s) => s.showLootRoll);
  const windowVariants = useDialogWindowVariants();
  const [freshRollId, setFreshRollId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { position, panelRef, startDrag, isDragging } = useDraggablePosition(state.position ?? topRight, {
    margin: MARGIN,
    onDragEnd: (settled) => update({ position: settled }),
  });

  const startResize = usePanelResize(panelRef, {
    min: MIN_SIZE,
    margin: MARGIN,
    onResizeEnd: (size) => update({ size }),
  });

  const loot = useCollectionLoot(app, collectionId);
  const { bases, loaded, basesAvailable } = useLootBases(app, loot.bases);
  const history = useLootHistory(app, collectionId);
  const disabled = useMemo(() => new Set(state.disabledViews), [state.disabledViews]);

  const enabled = useMemo(
    () => bases.flatMap((base) => base.views).filter((view) => !disabled.has(view.id)).flatMap((view) => view.items),
    [bases, disabled],
  );
  const excluded = useMemo(() => new Set(state.excludedRarities), [state.excludedRarities]);
  const rarityCounts = useMemo(() => countByRarity(enabled), [enabled]);
  const available = useMemo(() => countDrawable(enabled, excluded), [enabled, excluded]);

  const roll = (): void => {
    const draws = rollLoot(enabled, { count: state.count, excluded, currency: loot.currency });
    if (draws.length === 0 || !collectionId) return;
    const lootRoll = {
      id: crypto.randomUUID(),
      rolledAt: Date.now(),
      mapName: baseName(mapPath ?? '').replace(/\.atlasmap$/i, ''),
      draws,
    };
    showRoll(lootRoll);
    setFreshRollId(lootRoll.id);
    LootHistoryStore.forApp(app).add(collectionId, lootRoll);
  };

  const shownIds = usePlayerLootIds();
  // Stable, so the cards (memoised) render again only when their own item changes.
  const cardHandlers = useMemo(() => ({
    onOpenSource: (draw: LootDraw): void => openItemNote(app, draw),
    onOpenLink: (link: string): void => openLink(app, link),
    shownIds,
    onShowToPlayers: (draw: LootDraw): void => PlayerLootDisplay.get().toggle(draw),
  }), [app, shownIds]);

  const hasItems = bases.some((base) => base.views.some((view) => view.items.length > 0));

  return (
    <motion.section
      ref={panelRef}
      className={`atlas-loot-roller${isDragging ? ' is-dragging' : ''}`}
      style={{ left: position.x, top: position.y, ...state.size }}
      variants={windowVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      aria-label={t('loot.panel')}
    >
      <header className="atlas-loot-roller__header" onPointerDown={startDrag}>
        <GripHorizontal className="atlas-loot-roller__grip" />
        <span className="atlas-loot-roller__icon"><CoinIcon /></span>
        <h2 className="atlas-loot-roller__title">{t('loot.title')}</h2>
        <CloseButton onClick={() => setOpen(false)} aria-label={t('loot.close')} />
      </header>

      {!collectionId || !basesAvailable || !loaded || !hasItems ? (
        <LootEmptyState
          inCollection={collectionId !== null}
          basesAvailable={basesAvailable}
          loaded={loaded}
          baseCount={loot.bases.length}
          onSetUp={() => setSettingsOpen(true)}
        />
      ) : (
        <div className="atlas-loot-roller__body">
          <LootRollerTutorials hasRarities={rarityCounts.size > 0} rolled={freshRollId !== null} />
          <aside className="atlas-loot-roller__sidebar">
            <LootSourceTree bases={bases} disabled={disabled} onChange={(disabledViews) => update({ disabledViews })} />
          </aside>
          <div className="atlas-loot-roller__main">
            <LootRollBar
              rarityCounts={rarityCounts}
              excluded={excluded}
              onExcludedChange={(excludedRarities) => update({ excludedRarities })}
              count={state.count}
              available={available}
              onCountChange={(count) => update({ count })}
              onRoll={roll}
            />
            <LootPaneTabs
              pane={state.pane}
              historyCount={history.length}
              onSelect={(pane) => update({ pane })}
              onClearHistory={() => LootHistoryStore.forApp(app).clear(collectionId)}
            />
            <div className="atlas-loot-list">
              {state.pane === 'results' ? (
                <LootResults
                  roll={state.lastRoll}
                  fresh={state.lastRoll?.id === freshRollId}
                  {...cardHandlers}
                />
              ) : (
                <LootHistory
                  rolls={history}
                  onRemove={(rollId) => LootHistoryStore.forApp(app).remove(collectionId, rollId)}
                  {...cardHandlers}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {settingsOpen && collectionId && (
          <CollectionSettingsModal isOpen collectionId={collectionId} initialTab="loot" onClose={() => setSettingsOpen(false)} />
        )}
      </AnimatePresence>

      <div className="atlas-loot-roller__resize atlas-loot-roller__resize--right" onPointerDown={startResize('right')} />
      <div className="atlas-loot-roller__resize atlas-loot-roller__resize--bottom" onPointerDown={startResize('bottom')} />
      <div className="atlas-loot-roller__resize atlas-loot-roller__resize--corner" onPointerDown={startResize('corner')} />
    </motion.section>
  );
}
