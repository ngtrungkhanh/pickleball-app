import { describe, expect, it } from 'vitest';
import { getSeasonTimeText } from '../season-display';

describe('getSeasonTimeText', () => {
  it('uses the official end date for a completed season', () => {
    expect(getSeasonTimeText({
      selectedSeason: 'Season 1',
      activeSeason: 'Season 2',
      season: {
        active: false,
        start_date: '2026-06-01T00:00:00+07:00',
        end_date: '2026-06-25T00:00:00+07:00',
      },
      matchDates: ['2026-06-03T10:00:00+07:00', '2026-06-20T10:00:00+07:00'],
    })).toBe('01/06/2026 - 25/06/2026');
  });

  it('uses the latest match for an active season', () => {
    expect(getSeasonTimeText({
      selectedSeason: 'Season 2',
      activeSeason: 'Season 2',
      season: {
        active: true,
        start_date: '2026-07-01T00:00:00+07:00',
        end_date: '2026-07-30T00:00:00+07:00',
      },
      matchDates: ['2026-07-18T10:00:00+07:00'],
    })).toBe('01/07/2026 - 18/07/2026');
  });

  it('falls back to the latest match for legacy completed seasons without end date', () => {
    expect(getSeasonTimeText({
      selectedSeason: 'Season 1',
      activeSeason: 'Season 2',
      season: { active: false, start_date: '2026-06-01T00:00:00+07:00' },
      matchDates: ['2026-06-20T10:00:00+07:00'],
    })).toBe('01/06/2026 - 20/06/2026');
  });

  it('never ends before the latest recorded match', () => {
    expect(getSeasonTimeText({
      selectedSeason: 'Season 1',
      activeSeason: 'Season 2',
      season: {
        active: false,
        start_date: '2026-06-01T00:00:00+07:00',
        end_date: '2026-06-15T00:00:00+07:00',
      },
      matchDates: ['2026-06-20T10:00:00+07:00'],
    })).toBe('01/06/2026 - 20/06/2026');
  });

  it('does not render an inverted range when metadata ends before it starts', () => {
    expect(getSeasonTimeText({
      selectedSeason: 'Season 1',
      activeSeason: 'Season 2',
      season: {
        active: false,
        start_date: '2026-06-01T00:00:00+07:00',
        end_date: '2026-05-20T00:00:00+07:00',
      },
      matchDates: [],
    })).toBe('01/06/2026');
  });

  it('keeps aggregate mode based on first and last match', () => {
    expect(getSeasonTimeText({
      selectedSeason: null,
      activeSeason: 'Season 2',
      matchDates: ['2026-07-18T10:00:00+07:00', '2026-06-03T10:00:00+07:00'],
    })).toBe('03/06/2026 - 18/07/2026');
  });
});
