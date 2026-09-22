import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from '../../src/app/utils/relativeTime';

const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it.each([
    [NOW - 20_000, 'now'],
    [NOW - 5 * MINUTE, '5 minutes ago'],
    [NOW - 3 * HOUR, '3 hours ago'],
    [NOW - DAY, 'yesterday'],
    [NOW - 3 * DAY, '3 days ago'],
    [NOW - 2 * 7 * DAY, '2 weeks ago'],
    [NOW - 45 * DAY, 'last month'],
    [NOW - 400 * DAY, 'last year'],
    [NOW + 2 * HOUR, 'in 2 hours'],
  ])('formats %i as "%s"', (timestamp, expected) => {
    expect(formatRelativeTime(timestamp, NOW)).toBe(expected);
  });
});
