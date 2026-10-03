/** A bracket of a phrase, parentheses included; `end` is the index after it. */
export interface Bracket {
  start: number;
  end: number;
}

/** A phrase of a senses line, told apart into what stands in brackets and what does not. */
export interface PhraseText {
  text: string;
  /** `text` with every bracket blanked, so indices are those of `text`. */
  outside: string;
  /** The outermost brackets, in order. */
  brackets: Bracket[];
}

/**
 * `text` with its brackets found and blanked. A bracket that is never closed runs to the end
 * ("darkvision (60 ft."); a closing one without an opening is blanked as stray punctuation.
 */
export function splitPhrase(text: string): PhraseText {
  const brackets: Bracket[] = [];
  const outside = [...text];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '(' && depth++ === 0) start = i;
    if (depth > 0 || char === ')') outside[i] = ' ';
    if (char === ')' && depth > 0 && --depth === 0) brackets.push({ start, end: i + 1 });
  }
  if (depth > 0) brackets.push({ start, end: text.length });
  return { text, outside: outside.join(''), brackets };
}
