import { describe, expect, it } from 'vitest';
import { APP_CACHE_BROADCAST_CHANNEL, APP_CACHE_CHANGE_EVENT, APP_CACHE_SIGNAL_KEY, mergeAppCachePartVersions } from '../db';

describe('app cache metadata', () => {
  it('keeps matches version unchanged when a partial route sync only updates other parts', () => {
    const current = {
      matches: 100,
      players: 90,
      seasons: 80,
      config: 70,
      playerSeasonSettings: 60,
      admin: 50,
    };

    expect(mergeAppCachePartVersions(current, { players: 120, config: 120 })).toEqual({
      matches: 100,
      players: 120,
      seasons: 80,
      config: 120,
      playerSeasonSettings: 60,
      admin: 50,
    });
  });

  it('uses full part versions when every part is explicitly provided', () => {
    expect(mergeAppCachePartVersions({ matches: 5 }, {
      matches: 10,
      players: 11,
      seasons: 12,
      config: 13,
      playerSeasonSettings: 14,
      admin: 15,
    })).toEqual({
      matches: 10,
      players: 11,
      seasons: 12,
      config: 13,
      playerSeasonSettings: 14,
      admin: 15,
    });
  });

  it('uses one shared cross-tab cache signal contract', () => {
    expect(APP_CACHE_CHANGE_EVENT).toBe('pickleball-cache-change');
    expect(APP_CACHE_BROADCAST_CHANNEL).toBe('pickleball-cache');
    expect(APP_CACHE_SIGNAL_KEY).toBe('pickleball_cache_signal');
  });
});
