import { describe, expect, it } from '@jest/globals';
import { isValidIsoDate } from '../../src/utils/date';

describe('isValidIsoDate', () => {
  it.each(['2026-12-04', '2027-01-01', '2026-12-31', '2028-02-29', '2000-02-29'])('accepts %s', (value) => {
    expect(isValidIsoDate(value)).toBe(true);
  });

  it.each([
    ['a non-leap February 29', '2027-02-29'],
    ['a century year that is not a leap year', '1900-02-29'],
    ['April 31', '2026-04-31'],
    ['month 13', '2026-13-01'],
    ['month 00', '2026-00-10'],
    ['day 00', '2026-05-00'],
    ['day 32', '2026-01-32'],
    ['missing zero padding', '2026-1-5'],
    ['a timestamp', '2026-01-05T00:00:00Z'],
    ['a day-first format', '04-12-2026'],
    ['leading whitespace', ' 2026-01-05'],
    ['an empty string', ''],
    ['text', 'tomorrow'],
  ])('rejects %s', (_label, value) => {
    expect(isValidIsoDate(value)).toBe(false);
  });
});
