import { describe, expect, it } from 'vitest';

import { selectLeaderboardPlayers, selectScorePlayers } from '../player-season-settings';

const players = [
  { id: 'HA', name: 'Trần Ngọc Hà', active: false, hidden: false },
  { id: 'AN', name: 'An', active: true, hidden: false },
];

describe('player season settings', () => {
  it('uses the active flag from the selected season for score entry', () => {
    const result = selectScorePlayers(players, 'Season 2', [{
      id: 'HA_Season 2',
      player_id: 'HA',
      season: 'Season 2',
      active: true,
      pay_fine: true,
      hidden: false,
    }]);

    expect(result.map((player) => player.id)).toEqual(['HA', 'AN']);
  });

  it('removes a hidden active player from score entry and the leaderboard', () => {
    const settings = [{
      id: 'HA_Season 2',
      player_id: 'HA',
      season: 'Season 2',
      active: true,
      pay_fine: true,
      hidden: true,
    }];

    expect(selectScorePlayers(players, 'Season 2', settings).map((player) => player.id)).not.toContain('HA');
    expect(selectLeaderboardPlayers(players, 'Season 2', settings).map((player) => player.id)).not.toContain('HA');
  });

  it('falls back to the global player flags when a season has no override', () => {
    expect(selectScorePlayers(players, 'Season 1', []).map((player) => player.id)).toEqual(['AN']);
  });
});
