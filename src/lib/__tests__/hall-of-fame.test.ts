import { describe, expect, it, vi } from 'vitest';
import { buildHallOfFameEntries, type HallOfFameMatch, type HallOfFamePlayer } from '../hall-of-fame';

const players: HallOfFamePlayer[] = [
  { id: 'p1', name: 'P1' },
  { id: 'p2', name: 'P2' },
  { id: 'p3', name: 'P3' },
  { id: 'p4', name: 'P4' },
];

const seasonMatches: HallOfFameMatch[] = [
  {
    id: 'm1',
    date: '2026-06-01T10:00:00.000Z',
    season: 'Season 1',
    win_1: 'p1',
    win_2: 'p2',
    lose_1: 'p3',
    lose_2: 'p4',
    win_score: 11,
    lose_score: 5,
  },
];

describe('buildHallOfFameEntries', () => {
  it('freezes champion ELO at the completed season end date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T00:00:00.000Z'));

    try {
      const entries = buildHallOfFameEntries(
        players,
        seasonMatches,
        [
          {
            name: 'Season 1',
            active: false,
            start_date: '2026-06-01T00:00:00.000Z',
            end_date: '2026-06-01T20:00:00.000Z',
          },
          { name: 'Season 2', active: true, start_date: '2026-06-02T00:00:00.000Z' },
        ],
        'Season 2',
        5000,
      );

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        season: 'Season 1',
        playerId: 'p1',
        wins: 1,
        losses: 0,
        total: 1,
        winRate: 100,
        rating: 1517.5,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the last ranking match when legacy season data has no end date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));

    try {
      const entries = buildHallOfFameEntries(
        players,
        seasonMatches,
        [
          { name: 'Season 1', active: false, start_date: '2026-06-01T00:00:00.000Z' },
          { name: 'Season 2', active: true, start_date: '2026-06-02T00:00:00.000Z' },
        ],
        'Season 2',
        5000,
      );

      expect(entries[0]?.rating).toBe(1517.5);
    } finally {
      vi.useRealTimers();
    }
  });
});
