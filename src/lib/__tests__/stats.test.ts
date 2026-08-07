import { describe, it, expect } from 'vitest';
import { getSeasonSummaryStats, type StatMatch } from '../stats';
import type { FineSeason } from '../fines';

describe('getSeasonSummaryStats', () => {
  it('calculates seasonDays up to end of season for a closed season', () => {
    const matches: StatMatch[] = [
      { id: '1', date: '2026-01-01T10:00:00Z', season: 'Season 1', win_1: 'p1', win_2: 'p2', lose_1: 'p3', lose_2: 'p4', win_score: 11, lose_score: 5 },
      { id: '2', date: '2026-01-31T10:00:00Z', season: 'Season 1', win_1: 'p1', win_2: 'p2', lose_1: 'p3', lose_2: 'p4', win_score: 11, lose_score: 5 },
    ];

    const seasons: FineSeason[] = [
      { name: 'Season 1', active: false, start_date: '2026-01-01T00:00:00Z', end_date: '2026-01-31T23:59:59Z' },
      { name: 'Season 2', active: true, start_date: '2026-02-01T00:00:00Z' },
    ];

    const stats = getSeasonSummaryStats(matches, 5000, { seasons });

    // Jan 1 to Jan 31 is 31 days (not up to current date)
    expect(stats.seasonDays).toBe(31);
  });

  it('infers the closed season end from the next season start when end_date is missing', () => {
    const matches: StatMatch[] = [
      { id: '1', date: '2026-01-01T10:00:00Z', season: 'Season 1', win_1: 'p1', win_2: 'p2', lose_1: 'p3', lose_2: 'p4', win_score: 11, lose_score: 5 },
      { id: '2', date: '2026-01-15T10:00:00Z', season: 'Season 1', win_1: 'p1', win_2: 'p2', lose_1: 'p3', lose_2: 'p4', win_score: 11, lose_score: 5 },
    ];

    const seasons: FineSeason[] = [
      { name: 'Season 1', active: false, start_date: '2026-01-01T00:00:00Z' },
      { name: 'Season 2', active: true, start_date: '2026-02-01T00:00:00Z' },
    ];

    const stats = getSeasonSummaryStats(matches, 5000, { seasons });

    // The old data has no end_date, so Season 2 start marks the end of Season 1.
    expect(stats.seasonDays).toBe(31);
  });

  it('falls back to the last match for a closed season without any later season', () => {
    const matches: StatMatch[] = [
      { id: '1', date: '2026-01-01T10:00:00Z', season: 'Season 1', win_1: 'p1', win_2: 'p2', lose_1: 'p3', lose_2: 'p4', win_score: 11, lose_score: 5 },
      { id: '2', date: '2026-01-15T10:00:00Z', season: 'Season 1', win_1: 'p1', win_2: 'p2', lose_1: 'p3', lose_2: 'p4', win_score: 11, lose_score: 5 },
    ];

    const stats = getSeasonSummaryStats(matches, 5000, {
      seasons: [{ name: 'Season 1', active: false, start_date: '2026-01-01T00:00:00Z' }],
    });

    expect(stats.seasonDays).toBe(15);
  });

  it('calculates seasonDays up to Date.now() for an active season', () => {
    const tenDaysAgoStr = new Date(Date.now() - 9 * 86400000).toISOString();

    const matches: StatMatch[] = [
      { id: '1', date: tenDaysAgoStr, season: 'Season 2', win_1: 'p1', win_2: 'p2', lose_1: 'p3', lose_2: 'p4', win_score: 11, lose_score: 5 },
    ];

    const seasons: FineSeason[] = [
      { name: 'Season 1', active: false },
      { name: 'Season 2', active: true, start_date: tenDaysAgoStr },
    ];

    const stats = getSeasonSummaryStats(matches, 5000, { seasons });

    expect(stats.seasonDays).toBeGreaterThanOrEqual(9);
  });
});
