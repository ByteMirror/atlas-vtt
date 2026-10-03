import { POOLS, audio, disposeDiceSamples, jitter, voice, whenReady } from './diceSamples';
import { rollEnd } from './diceWheel';

/**
 * The sound of a roll: four voices, no sound bed.
 *
 * There used to be more: two synthesised beds, a shimmer and a riser into a
 * whoosh, meant as cinema and sounding like elevator music over a dice roll;
 * later still a click on every table hit and a glitter over the sparks. Six
 * voices for an event made of four. Now there are four, each saying one thing:
 *
 * 1. The rim (`bank`): wood on wood, the die hits the box.
 * 2. The wheel (`rollStart`): while the die flies, a wheel runs. Nothing else:
 *    no table clicks, no rustle, no bed.
 * 3. The fall (`rattle`): when it stops, a die rattles. The sound everyone knows.
 * 4. The verdict (`reveal`): a number stands. Every roll gets it, damage as well
 *    as the attack.
 */

/** The wheel lives in `diceWheel.ts`; its commands belong to the same four voices. */
export { rollEnd, rollStart } from './diceWheel';

let lastBank = 0;

/**
 * Stops the wheel and closes the audio context. The throttles are reset too:
 * they compare against the context's clock, which starts at zero again.
 */
export function disposeDiceSounds(): void {
  rollEnd();
  disposeDiceSamples();
  lastBank = 0;
  lastRattle = -1;
  rattleRun = 0;
}

/**
 * The rim: wood on wood.
 *
 * Two voices layered, because a strike is two things: the impact and what the
 * board does afterwards. Harder hits are lower and longer, not only louder: a
 * strong hit sets a larger piece of wood moving.
 *
 * ## A box, not a kettle
 *
 * The hit was long too low. Measured: centroid at 143 Hz, 97 % of the energy
 * below 500 Hz, eighty milliseconds of tail. Those are a bass drum's numbers,
 * and it sounded like one: the die fell against a membrane, not a board. The
 * recording was pitched down and capped at 1.4 kHz, leaving only body. A box
 * rim is a thin plate that sounds near one kilohertz, with the dry tick of the
 * die on top. So it is now pitched up, cut below and opened above, and since a
 * thin plate does not ring, it is over after forty milliseconds.
 *
 * Barely throttled, since wall hits are rare: the lock only keeps two dice
 * hitting in the same frame from fusing into one twice-as-loud strike.
 */
export function bank(intensity: number, pan = 0): void {
  const c = audio();
  if (c === null) return;
  if (c.currentTime - lastBank < 0.03) return;
  lastBank = c.currentTime;
  const punch = Math.min(1, Math.max(0.25, intensity));

  // The board: pitched up and cut below; what carries is the plate mode around
  // one kilohertz, not the kettle under it.
  voice({
    urls: POOLS.soft,
    rate: (2.6 - punch * 0.4) * jitter(0.13),
    gain: (0.36 + punch * 0.34) * jitter(0.18),
    pan,
    highpass: 340,
    lowpass: 4200 + punch * 1000,
    body: [980 - punch * 160, 5.5],
    decay: 0.05 + punch * 0.03,
  });
  // The tick: the die itself on the wood, a blink of plate with its lows
  // removed so it does not double the board's body.
  voice({
    urls: POOLS.plate,
    rate: 2.4 * jitter(0.2),
    gain: (0.15 + punch * 0.24) * jitter(0.3),
    pan,
    highpass: 1400,
    lowpass: 7000,
    decay: 0.018,
  });
}

/**
 * The fall. When the die stands it rattles: a real recording, pitch barely
 * touched. The only sound in the roll not rebuilt: what sounds like a die need
 * not be made into one.
 *
 * Follow-up dice are quieter than the first. A damage roll lands six bodies
 * fractions of a second apart, and the recording is itself several dice
 * rattling; six at full strength are eighteen dice and a mush. A die falling
 * shortly after another falls quieter and a touch higher, like a smaller body
 * following the first.
 */
const RATTLE_WINDOW = 0.45;
let lastRattle = -1;
let rattleRun = 0;

export function rattle(): void {
  const c = audio();
  if (c === null) return;
  // The roll hangs on this sound: if the samples are not ready, it is played
  // late instead of dropped.
  if (!whenReady(rattle)) return;
  rattleRun = c.currentTime - lastRattle < RATTLE_WINDOW ? rattleRun + 1 : 0;
  lastRattle = c.currentTime;
  const followUp = Math.min(4, rattleRun);
  voice({
    urls: POOLS.throw,
    rate: (1.02 + followUp * 0.06) * jitter(0.1),
    gain: 0.72 * Math.pow(0.62, followUp),
  });
}

/**
 * The high crit's chime: a wooden triad.
 *
 * A marimba bar is two things at once, a wooden strike and a tube resonating
 * under it. Built the same way: `soft`, pitched up and closed after fifty
 * milliseconds, is the mallet; the bell below, pitched down and stripped of its
 * metal, is the tube.
 *
 * The notes are in just intonation (1 : 5/4 : 3/2 : 2, root, major third,
 * fifth, octave), not equal temperament, because a percussion recording's
 * partials sit on no grid anyway; the warmth comes from beats that are not
 * there.
 *
 * The root is a frequency, not a playback rate: the rate `0.4` once stood here
 * and its pitch could only be measured, not read (152 Hz). The rate derives
 * from the bell's measured pitch (`BELL_TONE`), and filter and body hang on the
 * root instead of fixed hertz, so transposing does not bend the timbre:
 * `CHIME_ROOT` moves the pitch and nothing else.
 */
const CHIME = [1, 5 / 4, 3 / 2, 2] as const;
/** The chime's root in hertz. The one number worth turning. */
const CHIME_ROOT = 300;
/** The bell recording's own pitch at rate 1, measured, not guessed. */
const BELL_TONE = 380;
/** Where the lowpass sits, in multiples of the root. Smaller is rounder. */
const CHIME_ROLLOFF = 10;
/** Where the body resonates: above the note for a wooden bar, not on it. */
const CHIME_BODY = 2.75;
/** Gap between the notes. Close enough to stay one sound, not a melody. */
const CHIME_STEP = 0.07;

/**
 * The verdict: every roll gets its sound. The fall says the die lies, the
 * verdict says a number stands; two things, and the damage roll needs both.
 *
 * - High crit: the chime, always the same so it is recognised.
 * - An ordinary roll: metal or plate, short and darkly trimmed.
 * - Low crit: the dull piece, low and filtered, muted so nothing rings on.
 *
 * Ordinary and low rolls draw their pitch continuously, never from a scale:
 * once two rolls stand in an interval the ear knows, the roll sounds like music
 * instead of an object. The high crit is the exception for the same reason: it
 * is not an object falling but an announcement, which may hit a note and must
 * hit the same one every time. So it is the only sound without a random number.
 */
export function reveal(crit: 'high' | 'low' | null): void {
  const c = audio();
  if (c === null) return;
  // Like the fall: rather a blink late than never. The chime reads
  // `c.currentTime`, so the whole verdict is replayed, not just its voices.
  if (!whenReady(() => reveal(crit))) return;
  const rand = Math.random();

  if (crit === 'high') {
    const now = c.currentTime;
    CHIME.forEach((ratio, i) => {
      const hz = CHIME_ROOT * ratio;
      const at = now + i * CHIME_STEP;
      // The mallet: wood on wood, over before the note settles. It rises with
      // the bar, but less: a mallet does not change register because the bar
      // gets shorter.
      voice({
        urls: POOLS.soft,
        rate: 2.2 * Math.sqrt(ratio),
        gain: 0.24,
        when: at,
        lowpass: 2600,
        decay: 0.05,
      });
      // The tube: the bell retuned with its metal cut. The body sits nearly an
      // octave and a half above the root, where a wooden bar's body resonates,
      // not the note: warm, not boomy. Upper notes are quieter so the octave
      // crowns rather than stings.
      voice({
        urls: POOLS.bell,
        rate: hz / BELL_TONE,
        gain: 0.3 - i * 0.035,
        when: at,
        lowpass: hz * CHIME_ROLLOFF,
        body: [hz * CHIME_BODY, 6],
        decay: 0.5 + i * 0.22,
      });
    });
    return;
  }

  if (crit === 'low') {
    voice({
      urls: POOLS.soft,
      rate: 0.5 + rand * 0.22,
      gain: 0.72 + Math.random() * 0.12,
      lowpass: 600 + Math.random() * 340,
      body: [250, 5],
      decay: 0.3 + Math.random() * 0.2,
    });
    return;
  }

  voice({
    urls: Math.random() < 0.5 ? POOLS.metal : POOLS.plate,
    rate: 0.7 + rand * 0.46,
    gain: 0.4 + Math.random() * 0.14,
    lowpass: 2100 + Math.random() * 2300,
    decay: 0.26 + Math.random() * 0.24,
  });
}

/**
 * The burst of an exploding die: glass, the one material in the pool that
 * breaks. Upwards it is bright and short, a pane cracking; downwards, where the
 * next die will subtract, the same piece is pitched down and dulled, something
 * giving way. A blink of metal gives both their edge.
 */
export function burst(downwards = false): void {
  const c = audio();
  if (c === null) return;
  if (!whenReady(() => burst(downwards))) return;
  voice({
    urls: POOLS.glass,
    rate: (downwards ? 0.62 : 1.25) * jitter(0.08),
    gain: 0.5,
    highpass: downwards ? 300 : 900,
    ...(downwards && { lowpass: 3200 }),
    decay: downwards ? 0.3 : 0.22,
  });
  voice({
    urls: POOLS.metal,
    rate: (downwards ? 0.8 : 1.9) * jitter(0.1),
    gain: 0.16,
    highpass: 1800,
    decay: 0.12,
  });
}

/**
 * A modifier clicking in: not a second roll or verdict but a ratchet, a short
 * hard strike like a counter advancing one place. Two layers like a wheel
 * tooth, shorter and brighter. Each further modifier sits a little higher than
 * the last, so a series is heard as a series, not a stutter; the cap at six
 * steps keeps the last from sounding like a music box.
 */
const RATCHET_STEP = 1.055;
const RATCHET_TOP = 6;

export function ratchet(step = 0): void {
  const c = audio();
  if (c === null) return;
  if (!whenReady(() => ratchet(step))) return;
  const pitch = Math.pow(RATCHET_STEP, Math.min(RATCHET_TOP, step));

  // Below, the wood: the same raw material as everywhere, trimmed hard.
  voice({
    urls: POOLS.soft,
    rate: 2.5 * pitch * jitter(0.05),
    gain: 0.4,
    highpass: 420,
    lowpass: 3400,
    body: [1100, 4],
    decay: 0.045,
  });
  // Above, the pawl: a blink of metal for an edge, quiet enough to belong to
  // the wood.
  voice({
    urls: POOLS.metal,
    rate: 3.1 * pitch * jitter(0.06),
    gain: 0.09,
    highpass: 2600,
    decay: 0.02,
  });
}
