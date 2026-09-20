import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TFile, type App } from 'obsidian';
import {
  findCreatureForNotePath,
  getFantasyStatblocksApi,
  layoutForCreature,
  resolveCreatureFromFence,
  resolveLayout,
  type FantasyStatblocksCreature,
} from '../../services/FantasyStatblocksService';
import { resolveStatblockNote } from '../../services/statblockNoteSource';
import { syncStatblockVitals, type TokenVitals } from '../../services/statblockVitalsSync';
import { attachDiceRolling } from '../../services/statblockDiceLinks';
import { StatblockRenderer, type StatblockPortrait } from './statblock/StatblockRenderer';
import { TokenPickerModal } from '../../packages/components/token-picker/TokenPickerModal';
import { TokenStatblockLinkService } from '../../services/TokenStatblockLinkService';
import { StatblockTokenResources, type StatblockTokenActions } from './statblock/StatblockTokenResources';
import type { StatblockEditApi } from './statblock/statblockEditContext';
import { isEditableNote, writeStatblockValue } from '../../services/statblockEditing';

interface FantasyStatblockProps {
  /** Vault path of the note backing the Fantasy Statblocks creature */
  notePath: string;
  /** Obsidian app — used for markdown, images and click-to-roll dice */
  app: App;
  /** Tokens whose HP/stress drive the statblock's vitals — one block per token */
  tokens?: TokenVitals[];
  /** Allows values to be edited in place, writing back to the note's frontmatter */
  editable?: boolean;
  className?: string;
  tokenActions?: StatblockTokenActions;
}

/** Signature of the values mirrored into the statblock, for change detection. */
function vitalsKey(tokens: TokenVitals[]): string {
  return JSON.stringify(tokens.map((t) => [t.name, t.hp, t.stress, t.maxStress]));
}

/**
 * Renders a Fantasy Statblocks creature with Atlas' own statblock components.
 */
export function FantasyStatblock({
  notePath,
  app,
  tokens = [],
  editable = false,
  className,
  tokenActions,
}: FantasyStatblockProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const tokensRef = useRef<TokenVitals[]>(tokens);
  tokensRef.current = tokens;

  const key = useMemo(() => vitalsKey(tokens), [tokens]);

  // Bumped whenever Fantasy Statblocks re-parses its bestiary, so edits made
  // here (and elsewhere in the vault) show up without a manual refresh.
  const [revision, setRevision] = useState(0);

  // Subscribe through Obsidian's event bus rather than the plugin API: on a
  // window reload Fantasy Statblocks may load *after* this component mounts, in
  // which case its API isn't on `window` yet and a direct subscription would be
  // silently skipped, leaving the statblock permanently blank.
  useEffect(() => {
    const bump = (): void => setRevision((value) => value + 1);
    const events = [
      'fantasy-statblocks:loaded',
      'fantasy-statblocks:bestiary:resolved',
      'fantasy-statblocks:bestiary:updated',
    ] as const;

    const refs = events.map((event) =>
      app.workspace.on(event as never, bump as never),
    );
    return () => refs.forEach((ref) => app.workspace.offref(ref));
  }, [app]);

  const bestiaryCreature = useMemo(
    () => findCreatureForNotePath(notePath),
    // `revision` is not read by the lookup; it re-runs it when the bestiary changes.
    [notePath, revision],
  );

  // Notes that define their statblock in a ```statblock fence never enter the
  // bestiary, so resolve those from the fence itself.
  const [fenceCreature, setFenceCreature] = useState<FantasyStatblocksCreature | null>(null);

  useEffect(() => {
    if (bestiaryCreature) {
      setFenceCreature(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const file = app.vault.getAbstractFileByPath(notePath);
      if (!(file instanceof TFile)) return;

      const source = await resolveStatblockNote(app, file);
      if (cancelled || source?.kind !== 'codeblock') return;

      const resolved = await resolveCreatureFromFence(app, source.params, notePath);
      if (!cancelled) setFenceCreature(resolved);
    })();

    return () => {
      cancelled = true;
    };
  }, [app, notePath, bestiaryCreature, revision]);

  const creature = bestiaryCreature ?? fenceCreature;
  const layout = useMemo(
    () => (creature ? layoutForCreature(app, creature) : null),
    [app, creature],
  );

  const portraitToken = tokens.find((token) => token.imagePath);
  const portraitPath = portraitToken?.imagePath;
  const portraitRingColor = portraitToken?.ringColor;
  const portrait = useMemo((): StatblockPortrait | undefined => {
    if (!portraitPath) return undefined;
    const file = app.vault.getAbstractFileByPath(portraitPath);
    if (!(file instanceof TFile)) return undefined;
    return { src: app.vault.getResourcePath(file), ringColor: portraitRingColor };
  }, [app, portraitPath, portraitRingColor]);

  // One block per token, matching the vitals sync. The token portrait replaces
  // the layout's own image block, so the artwork never shows twice.
  const monster = useMemo(
    () =>
      creature
        ? {
            ...creature,
            ...(tokens.length ? { qty: tokens.length } : {}),
            ...(portrait ? { image: undefined } : {}),
          }
        : null,
    [creature, tokens.length, portrait],
  );

  const commit = useCallback(
    (path: Array<string | number>, value: string): void => {
      void writeStatblockValue(app, notePath, path, value);
    },
    [app, notePath],
  );

  const edit = useMemo(
    (): StatblockEditApi => ({
      // Edits write to the note's frontmatter, so they only apply to creatures
      // parsed from it. Fence-defined creatures live in the code block instead.
      editable: editable && Boolean(bestiaryCreature) && isEditableNote(app, notePath),
      commit,
    }),
    [editable, bestiaryCreature, app, notePath, commit],
  );

  /**
   * Assigning a token also becomes the statblock's image: the link service
   * writes the chosen token's art into the note's `image` frontmatter, so the
   * pair stays in lockstep.
   */
  const assignToken = useCallback((): void => {
    const file = app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) return;

    new TokenPickerModal(app, file, (tokenPath: string) => {
      void TokenStatblockLinkService.getInstance(app).linkTokenToStatblock(tokenPath, notePath);
    }).open();
  }, [app, notePath]);

  // Click-to-roll dice, applied to whatever the renderer produced.
  useEffect(() => {
    const el = ref.current;
    if (!el || !monster) return;

    return attachDiceRolling(el, app, () => {
      const [token] = tokensRef.current;
      return {
        tokenId: token?.id,
        statblockPath: notePath,
        tokenName: token?.name ?? (monster.name),
        tokenImagePath: token?.imagePath,
      };
    });
  }, [app, monster, notePath]);

  // Mirror token HP/stress into any vitals track the layout renders.
  useEffect(() => {
    if (ref.current && !tokenActions) {
      syncStatblockVitals(ref.current, tokensRef.current);
    }
  }, [key, monster, tokenActions]);

  const api = getFantasyStatblocksApi();

  if (!api) {
    return (
      <div className="atlas-statblock-missing-hint">
        Install and enable the Fantasy Statblocks plugin to preview statblocks.
      </div>
    );
  }

  if (!monster || !layout) {
    // The bestiary is parsed asynchronously at startup, so an unresolved
    // bestiary means "not ready yet" rather than "no such creature".
    if (!api.isResolved?.()) {
      return <div className="atlas-statblock-missing-hint">Loading statblock…</div>;
    }

    return (
      <div className="atlas-statblock-missing-hint">
        No Fantasy Statblocks creature found for this note. Note-based creatures require
        &quot;Parse Frontmatter for Creatures&quot; to be enabled in Fantasy Statblocks settings.
      </div>
    );
  }

  return (
    <div ref={ref} className={`atlas-fantasy-statblock ${className ?? ''}`}>
      <StatblockRenderer
        monster={monster}
        layout={layout}
        resolveLayout={(id) => resolveLayout(app, id)}
        app={app}
        sourcePath={notePath}
        edit={edit}
        portrait={portrait}
        replaceVitals={Boolean(tokenActions)}
        footer={tokenActions && tokens.length > 0 ? (
          <StatblockTokenResources monster={monster} layout={layout} tokens={tokens} {...tokenActions} />
        ) : undefined}
        {...(editable ? { onAssignToken: assignToken } : {})}
      />
    </div>
  );
}

export default FantasyStatblock;
