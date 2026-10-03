import type { ResourceHolder } from '../resources/resourceTypes';

/**
 * Mirrors Atlas token HP/stress into the checkbox tracks that the Fantasy
 * Statblocks Daggerheart layout renders, and locks them against editing.
 *
 * Vitals are owned by the token on the game board — the statblock is a
 * read-only view of them.
 */

export interface TokenVitals extends ResourceHolder {
  /** Ties dice rolls made from the statblock to the token's current artwork. */
  id?: string | undefined;
  name?: string | undefined;
  instanceNumber?: number | undefined;
  /** Token artwork, shown on the statblock and alongside dice rolls made from it. */
  imagePath?: string | undefined;
  ringColor?: string | undefined;
  showRing?: boolean | undefined;
}

/**
 * Narrows any token-like entity to just its vitals. Entities that carry none
 * (plain map tokens) yield an empty record, which renders the statblock's own
 * values locked rather than syncing anything.
 */
export function toTokenVitals(entity: unknown): TokenVitals {
  const { id, name, imagePath, ringColor, showRing, instanceNumber, resources, overriddenMax } = (entity ?? {}) as TokenVitals;
  return { id, name, imagePath, ringColor, showRing, instanceNumber, resources, overriddenMax };
}

/** The tracks the Fantasy Statblocks Daggerheart layout renders, by the resource key that drives each. */
type TrackKind = 'hp' | 'stress';

/** `total: null` means "keep however many boxes the statblock rendered". */
interface Track {
  marked: number;
  total: number | null;
}

function trackOf(token: TokenVitals, kind: TrackKind): Track | null {
  const value = token.resources?.[kind];
  if (!value) return null;
  // HP is stored as what remains and its boxes mark damage; stress is stored as what is marked.
  const marked = kind === 'hp' ? value.max - value.current : value.current;
  return { marked, total: value.max > 0 ? value.max : null };
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
    const box = createEl('input');
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
    applyTrack(block, 'hp', token ? trackOf(token, 'hp') : null);
    applyTrack(block, 'stress', token ? trackOf(token, 'stress') : null);

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
