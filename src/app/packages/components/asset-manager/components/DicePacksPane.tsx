import React, { useEffect, useRef, useState } from 'react';
import { Notice, type App } from 'obsidian';
import { Check, FolderInput, Trash2 } from 'lucide-react';
import { Button } from '../../primitives/button';
import { AssetService } from '../../../../services/AssetService';
import { confirmAction } from '../../../../ui/confirmDialog';
import { deleteDicePack, importDicePack, type DicePackInfo } from '../../../../physical-dice/dicePackStore';
import { resolvePhysicalDice } from '../../../../physical-dice/physicalDiceSettings';
import { useDicePacks } from '../../../../physical-dice/useDicePacks';
import { DicePackPreviews } from '../../../../physical-dice/DicePackPreviews';

/** The pack's d20, turning. */
function DicePackPreview({ app, root }: { app: App; root: string }): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const previews = DicePackPreviews.forApp(app);
    previews.attach(canvas, root);
    return () => previews.release(canvas);
  }, [app, root]);
  return <canvas ref={canvasRef} className="atlas-dice-pack__die" aria-label="The pack's d20" />;
}

interface DicePacksPaneProps {
  app: App;
  collectionId: string;
}

/** The pack a collection's physical dice wear: '' for the built-in one. */
function usePackInUse(app: App, collectionId: string): string {
  const read = (): string => AssetService.getInstance(app).getCollectionSettings(collectionId).physicalDice?.pack ?? '';
  const [inUse, setInUse] = useState(read);
  useEffect(() => {
    setInUse(read());
    const ref = app.workspace.on('atlas-vtt:collection-settings-changed', (changed) => {
      if (changed === collectionId) setInUse(read());
    });
    return () => app.workspace.offref(ref);
  }, [app, collectionId]);
  return inUse;
}

/**
 * The asset manager's Dice tab: the dice packs the collection's physical dice
 * can wear. A pack is a folder with a `pack.json` and its face sheets; importing
 * copies the picked folder into the collection.
 */
export function DicePacksPane({ app, collectionId }: DicePacksPaneProps): React.ReactElement {
  const { packs, loading, refresh } = useDicePacks(app, collectionId);
  const inUse = usePackInUse(app, collectionId);
  const [busy, setBusy] = useState(false);
  // A chosen pack that is gone falls back to the built-in one.
  const activeId = packs.some((pack) => pack.id === inUse) ? inUse : '';

  const usePack = (pack: DicePackInfo): void => {
    const assets = AssetService.getInstance(app);
    const current = resolvePhysicalDice(assets.getCollectionSettings(collectionId).physicalDice);
    void assets.updateCollectionSettings(collectionId, { physicalDice: { ...current, pack: pack.id || undefined } });
  };

  const importPack = (): void => {
    const input = document.body.createEl('input', { type: 'file', cls: 'atlas-hidden-file-input' });
    input.setAttribute('webkitdirectory', '');
    input.multiple = true;
    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? []);
      input.remove();
      if (!files.length) return;
      setBusy(true);
      importDicePack(app, collectionId, files)
        .then((id) => {
          new Notice(`Imported dice pack "${id}"`);
          refresh();
          app.workspace.trigger('atlas-vtt:refresh-assets');
        })
        .catch((error: unknown) => new Notice(`Could not import the dice pack: ${error instanceof Error ? error.message : String(error)}`))
        .finally(() => setBusy(false));
    });
    input.addEventListener('cancel', () => input.remove());
    input.click();
  };

  const removePack = async (pack: DicePackInfo): Promise<void> => {
    const confirmed = await confirmAction({
      title: `Delete "${pack.name}"?`,
      message: [
        'The pack folder moves to the trash.',
        ...(pack.id === activeId ? ['This collection uses it; its dice go back to the default pack.'] : []),
      ],
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    await deleteDicePack(app, collectionId, pack.id);
    if (pack.id === activeId) usePack({ ...pack, id: '' });
    refresh();
    app.workspace.trigger('atlas-vtt:refresh-assets');
  };

  return (
    <div className="atlas-dice-packs">
      <div className="atlas-dice-packs__head">
        <h3 className="atlas-dice-packs__title">Dice</h3>
        <Button variant="outline" onClick={importPack} disabled={busy}>
          <FolderInput /> {busy ? 'Importing…' : 'Import pack folder'}
        </Button>
      </div>

      {!loading && packs.length === 0 && (
        <p className="atlas-dice-packs__empty">No dice packs yet. Import a pack folder to add one.</p>
      )}

      <div className="atlas-dice-packs__grid">
        {packs.map((pack) => {
          const active = pack.id === activeId;
          return (
            <div key={pack.id || 'built-in'} className={`atlas-dice-pack${active ? ' atlas-active' : ''}`}>
              <div className="atlas-dice-pack__preview">
                <DicePackPreview app={app} root={pack.root} />
              </div>
              <div className="atlas-dice-pack__body">
                <div className="atlas-dice-pack__name">{pack.name}</div>
                <div className="atlas-dice-pack__meta">{pack.builtIn ? 'Built in' : 'In this collection'}</div>
              </div>
              <div className="atlas-dice-pack__actions">
                {active ? (
                  <span className="atlas-dice-pack__in-use"><Check /> In use</span>
                ) : (
                  <Button variant="outline" onClick={() => usePack(pack)}>Use for collection</Button>
                )}
                {!pack.builtIn && (
                  <Button variant="ghost" size="icon" aria-label={`Delete ${pack.name}`} onClick={() => void removePack(pack)}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
