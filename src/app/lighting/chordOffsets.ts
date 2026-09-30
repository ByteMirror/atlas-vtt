/** Area of a unit disc left of x, as a share of the whole. */
function discShare(x: number): number {
  return 0.5 + (x * Math.sqrt(1 - x * x) + Math.asin(x)) / Math.PI;
}

/**
 * Positions across a round flame (−1..1) at the centres of `n` strips of equal area, so rays
 * through them weigh the same and the penumbra fades like a real disc.
 */
export function chordOffsets(n: number): number[] {
  return Array.from({ length: n }, (_, k) => {
    const target = (k + 0.5) / n;
    let lo = -1, hi = 1;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (discShare(mid) < target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  });
}
