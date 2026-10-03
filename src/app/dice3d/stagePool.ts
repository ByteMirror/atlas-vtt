import { DiceRenderer, stagePixelRatio } from './DiceRenderer';
import { DIE_BODIES } from './diceScene';
import { loadDiceArtwork } from './dieArtwork';
import { makeDie } from './dieMotion';

/**
 * **The pool of stages: why the app survives many throws.**
 *
 * One WebGL context per throw sounds clean and was the most expensive line of
 * the whole application: the browser keeps only a handful at once, and a
 * returned one keeps counting until garbage collection collects it (the
 * measurement is noted at `DiceRenderer.reset`). On a phone the system reloads
 * the page under memory pressure instead of warning.
 *
 * So stages are borrowed, not built. A stage that leaves clears itself and
 * goes back into the pool; the next one takes it, canvas and all. Moving an
 * element costs the context nothing; only *throwing it away* did. The pool
 * therefore never grows beyond the number of stages that were ever on screen at
 * the same time (plus those fading out).
 *
 * **And it lives in its own module, not with the stage component**, so a hot
 * reload of the component does not drop it and pile up exactly the contexts
 * this is about.
 *
 * Atlas can show dice in the main window and in a pop-out window. A canvas and
 * its context belong to one document, so there is one pool per document.
 */

/** A canvas with a live context. `renderer` is null where there is no WebGL. */
export interface StageLease {
  canvas: HTMLCanvasElement;
  renderer: DiceRenderer | null;
}

let pools = new WeakMap<Document, StageLease[]>();
/** How many stages of a document are out on a panel. */
let lent = new WeakMap<Document, number>();
/** The documents whose stages are being built ahead. */
let warming = new WeakSet<Document>();
/**
 * The documents where a stage got no WebGL context or lost it. The browser
 * blocks WebGL for a page whose contexts keep getting lost, so later stages
 * would stay blank too: their rolls show as result cards instead.
 */
let withoutDice = new WeakSet<Document>();

function poolOf(doc: Document): StageLease[] {
  let pool = pools.get(doc);
  if (pool === undefined) {
    pool = [];
    pools.set(doc, pool);
  }
  return pool;
}

function buildStage(doc: Document): StageLease {
  // Adopted before the context is created, so the canvas and its context
  // belong to the document it will be shown in.
  const canvas = doc.adoptNode(createEl('canvas', { cls: 'atlas-dice-stage__canvas', attr: { 'aria-hidden': 'true' } }));
  canvas.addEventListener('webglcontextlost', () => withoutDice.add(doc));
  try {
    return { canvas, renderer: new DiceRenderer(canvas) };
  } catch {
    // No WebGL (jsdom, a blocked or broken GPU): the math runs, the picture is missing.
    withoutDice.add(doc);
    return { canvas, renderer: null };
  }
}

/** Whether `doc` can show 3D dice: false once one of its stages had no WebGL. */
export function canShowDice(doc: Document): boolean {
  return !withoutDice.has(doc);
}

export function borrowStage(doc: Document): StageLease {
  lent.set(doc, (lent.get(doc) ?? 0) + 1);
  return poolOf(doc).pop() ?? buildStage(doc);
}

export function returnStage(lease: StageLease): void {
  const doc = lease.canvas.ownerDocument;
  lease.canvas.remove();
  lease.renderer?.reset();
  lent.set(doc, Math.max(0, (lent.get(doc) ?? 0) - 1));
  poolOf(doc).push(lease);
}

/**
 * **A stage is built before a roll needs it.**
 *
 * Building one takes some fifty to ninety milliseconds: a WebGL context, the
 * mirror world, the shaders. On the first roll that was a freeze at the very
 * moment the dice leave the hand, again for the player window, and again for
 * the second panel of an attack and its damage. So each document gets its
 * stages while nothing rolls: as many as rolls stand at once (`rollStackState`)
 * and one for the roll that fades out as the next arrives.
 */
const WARM_STAGES = 4;
/** The pause before a stage is built, and between two: the map opening has the frames first. */
const WARM_PAUSE_MS = 500;
/** How long a build waits for an idle moment before it takes one. */
const WARM_PATIENCE_MS = 3000;
/**
 * The canvas a stage waits with, in rem: the roll panel's width and more than
 * its height (`dice-roll.scss`), so a panel finds its canvas made
 * (`DiceRenderer.setView`).
 */
const WARM_REM = [21, 24] as const;
/** Fast enough for the smear, whose translucent shader a still die never asks for. */
const WARM_SPIN = [40, 0, 0] as const;

function whenQuiet(doc: Document, run: () => void): void {
  const win = doc.defaultView;
  if (!win) return;
  win.setTimeout(() => {
    if (typeof win.requestIdleCallback === 'function') win.requestIdleCallback(run, { timeout: WARM_PATIENCE_MS });
    else run();
  }, WARM_PAUSE_MS);
}

/**
 * One unseen frame of every body, spinning: after it the shaders are compiled
 * and the artwork is on the graphics card, so the first throw's first frame
 * costs what every other does.
 */
function warmUp(renderer: DiceRenderer, win: Window): void {
  const rem = parseFloat(win.getComputedStyle(win.document.documentElement).fontSize) || 16;
  renderer.setSize(Math.ceil(WARM_REM[0] * rem), Math.ceil(WARM_REM[1] * rem), stagePixelRatio(win));
  renderer.setPlan(DIE_BODIES);
  renderer.render(DIE_BODIES.map((sides) => ({ sides, anim: { ...makeDie(Math.random), w: [...WARM_SPIN] } })), 0);
  renderer.reset();
}

function warmNext(doc: Document): void {
  const pool = poolOf(doc);
  const out = lent.get(doc) ?? 0;
  if (pool.length + out >= WARM_STAGES) return;
  // Dice are on a stage: building now would be the freeze this is here to avoid.
  if (out === 0) {
    const stage = buildStage(doc);
    if (stage.renderer && doc.defaultView) warmUp(stage.renderer, doc.defaultView);
    pool.push(stage);
  }
  whenQuiet(doc, () => warmNext(doc));
}

/**
 * Builds the stages of `doc` ahead, one per quiet moment and none while dice
 * are rolling. `artwork` is what the warm-up frame draws: without the numerals
 * and the card it would put blank faces on the graphics card.
 */
export function warmStages(doc: Document, artwork: Promise<void> = loadDiceArtwork()): void {
  if (warming.has(doc)) return;
  warming.add(doc);
  void artwork.then(() => whenQuiet(doc, () => warmNext(doc)));
}

/** Tests only: empty the pools between two cases. */
export function resetStagePool(): void {
  pools = new WeakMap();
  lent = new WeakMap();
  warming = new WeakSet();
  withoutDice = new WeakSet();
}
