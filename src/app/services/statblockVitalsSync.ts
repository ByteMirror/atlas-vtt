import type { TokenResourceValue } from '../types';

/**
 * Mirrors Atlas token HP/stress into the checkbox tracks that the Fantasy
 * Statblocks Daggerheart layout renders, and locks them against editing.
 *
 * Vitals are owned by the token on the game board — the statblock is a
 * read-only view of them.
 */

export interface TokenVitals {
  /** Ties dice rolls made from the statblock to the token's current artwork. */
  id?: string | undefined;
  name?: string | undefined;
  instanceNumber?: number | undefined;
  hope?: number | TokenResourceValue | undefined;
  statblockResources?: Record<string, TokenResourceValue> | undefined;
  hp?: number | { current: number; max: number } | undefined;
  stress?: number | { current: number; max: number } | undefined;
  maxStress?: number | undefined;
  /** Token artwork, shown on the statblock and alongside dice rolls made from it. */
  imagePath?: string | undefined;
  ringColor?: string | undefined;
}

/**
 * Narrows any token-like entity to just its vitals. Entities that carry none
 * (plain map tokens) yield an empty record, which renders the statblock's own
 * values locked rather than syncing anything.
 */
export function toTokenVitals(entity: unknown): TokenVitals {
  const { id, name, hp, stress, maxStress, imagePath, ringColor, instanceNumber, hope, statblockResources } = (entity ?? {}) as TokenVitals;
  return { id, name, hp, stress, maxStress, imagePath, ringColor, instanceNumber, hope, statblockResources };
}

type TrackKind = 'hp' | 'stress';

/** `total: null` means "keep however many boxes the statblock rendered". */
interface Track {
  marked: number;
  total: number | null;
}

function hpTrack(token: TokenVitals): Track | null {
  if (token.hp == null) return null;
  const current = typeof token.hp === 'number' ? token.hp : token.hp.current;
  const max = typeof token.hp === 'number' ? token.hp : token.hp.max;
  // Daggerheart marks HP boxes as damage is taken, so marked === missing HP.
  return { marked: max - current, total: max > 0 ? max : null };
}

function stressTrack(token: TokenVitals): Track | null {
  if (token.stress == null) return null;
  const current = typeof token.stress === 'number' ? token.stress : token.stress.current;
  const max = typeof token.stress === 'object' ? token.stress.max : token.maxStress ?? 0;
  // Stress counts up as it is spent, so marked === the current value.
  return { marked: current, total: max > 0 ? max : null };
}

function boxesOf(block: HTMLElement, kind: TrackKind): HTMLInputElement[] {
  return Array.from(block.querySelectorAll<HTMLInputElement>('input.stat-value')).filter((box) =>
    Array.from(box.classList).some((name) => name.startsWith(`${kind}-`)),
  );
}

function resizeTrack(boxes: HTMLInputElement[], kind: TrackKind, total: number): HTMLInputElement[] {
  if (boxes.length === total || boxes.length === 0) return boxes;

  if (total < boxes.length) {
    boxes.slice(total).forEach((box) => box.remove());
    return boxes.slice(0, total);
  }

  let anchor = boxes[boxes.length - 1]!;
  const parent = anchor.parentElement;
  if (!parent) return boxes;

  const grown = [...boxes];
  for (let index = boxes.length; index < total; index++) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.classList.add(`${kind}-${index}`, 'stat-value');
    parent.insertBefore(box, anchor.nextSibling);
    grown.push(box);
    anchor = box;
  }
  return grown;
}

function applyTrack(block: HTMLElement, kind: TrackKind, track: Track | null): void {
  let boxes = boxesOf(block, kind);
  if (!boxes.length) return;

  if (track?.total != null) {
    boxes = resizeTrack(boxes, kind, track.total);
  }

  boxes.forEach((box, index) => {
    if (track) {
      box.checked = index < track.marked;
    }
    box.disabled = true;
  });
}

/**
 * Applies `tokens[i]` to the i-th adversary block. Blocks without a matching
 * token keep the statblock's own values and are locked read-only.
 */
export function syncStatblockVitals(el: HTMLElement, tokens: TokenVitals[]): void {
  const blocks = el.querySelectorAll<HTMLElement>('.stat-line');

  blocks.forEach((block, index) => {
    const token = tokens[index];
    block.classList.add('atlas-vitals-locked');
    applyTrack(block, 'hp', token ? hpTrack(token) : null);
    applyTrack(block, 'stress', token ? stressTrack(token) : null);

    const nameEl = block.querySelector('.adversary-name');
    const label = token?.name ? `${token.name.toUpperCase()}: ` : null;
    // Guard the write: an unconditional assignment would retrigger the observer.
    if (nameEl && label && nameEl.textContent !== label) {
      nameEl.textContent = label;
    }
  });
}

/**
 * Keeps the vitals in sync across Fantasy Statblocks' async mount and any
 * re-render it performs. `getTokens` is read on every pass so that a later
 * re-render never restores stale values. Returns a disposer.
 */
export function watchStatblockVitals(el: HTMLElement, getTokens: () => TokenVitals[]): () => void {
  const sync = (): void => syncStatblockVitals(el, getTokens());
  sync();

  const observer = new MutationObserver(sync);
  observer.observe(el, { childList: true, subtree: true });

  return () => observer.disconnect();
}
