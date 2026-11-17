import { describe, expect, it } from 'vitest';
import { resolveTimeframe, TimeframeError } from './timeframe.js';

const TODAY = '2026-11-16'; // a Monday, in Q4

describe('resolveTimeframe', () => {
  it.each([
    ['last_two_weeks', '2026-11-03', '2026-11-16'],
    ['current_week', '2026-11-16', '2026-11-16'],
    ['current_month', '2026-11-01', '2026-11-16'],
    ['last_month', '2026-10-01', '2026-10-31'],
    ['current_quarter', '2026-10-01', '2026-11-16'],
    ['last_quarter', '2026-07-01', '2026-09-30'],
    ['current_year', '2026-01-01', '2026-11-16'],
    ['last_year', '2025-01-01', '2025-12-31'],
  ] as const)('%s → %s..%s', (preset, from, to) => {
    expect(resolveTimeframe({ preset }, TODAY)).toEqual({ from, to });
  });

  it('starts the week on Monday', () => {
    expect(resolveTimeframe({ preset: 'current_week' }, '2026-11-22')).toEqual({ from: '2026-11-16', to: '2026-11-22' });
  });

  it('handles year boundaries for last month and last quarter', () => {
    expect(resolveTimeframe({ preset: 'last_month' }, '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(resolveTimeframe({ preset: 'last_quarter' }, '2026-02-10')).toEqual({ from: '2025-10-01', to: '2025-12-31' });
  });

  it('handles leap years', () => {
    expect(resolveTimeframe({ preset: 'last_month' }, '2028-03-05')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  describe('custom', () => {
    it('accepts a range of up to one year', () => {
      expect(resolveTimeframe({ preset: 'custom', from: '2025-01-01', to: '2025-12-31' }, TODAY)).toEqual({
        from: '2025-01-01',
        to: '2025-12-31',
      });
    });

    it('rejects ranges longer than one year', () => {
      expect(() => resolveTimeframe({ preset: 'custom', from: '2025-01-01', to: '2026-01-01' }, TODAY)).toThrow(TimeframeError);
    });

    it('rejects reversed ranges', () => {
      expect(() => resolveTimeframe({ preset: 'custom', from: '2026-02-01', to: '2026-01-01' }, TODAY)).toThrow(TimeframeError);
    });

    it('rejects malformed dates', () => {
      expect(() => resolveTimeframe({ preset: 'custom', from: '2026-02-30', to: '2026-03-01' }, TODAY)).toThrow(TimeframeError);
      expect(() => resolveTimeframe({ preset: 'custom', from: 'yesterday', to: '2026-03-01' }, TODAY)).toThrow(TimeframeError);
    });
  });
});
