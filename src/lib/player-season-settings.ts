import type { StoredPlayerSeasonSetting } from './db';

export type SeasonAwarePlayer = {
  id?: string;
  active?: boolean;
  pay_fine?: boolean;
  hidden?: boolean;
  deleted_at?: unknown;
  [key: string]: unknown;
};

export function applyPlayerSeasonSettings<T extends SeasonAwarePlayer>(
  players: readonly T[],
  season: string,
  settings: readonly StoredPlayerSeasonSetting[],
) {
  const settingsByPlayer = new Map(
    settings
      .filter((setting) => setting.season === season)
      .map((setting) => [setting.player_id, setting]),
  );

  return players.map((player) => {
    const setting = player.id ? settingsByPlayer.get(player.id) : undefined;
    return {
      ...player,
      active: setting ? setting.active !== false : player.active !== false,
      pay_fine: setting ? setting.pay_fine !== false : player.pay_fine !== false,
      hidden: setting ? setting.hidden === true : player.hidden === true,
    };
  });
}

export function selectScorePlayers<T extends SeasonAwarePlayer>(
  players: readonly T[],
  season: string,
  settings: readonly StoredPlayerSeasonSetting[],
) {
  return applyPlayerSeasonSettings(players, season, settings)
    .filter((player) => player.active && !player.deleted_at);
}

export function selectLeaderboardPlayers<T extends SeasonAwarePlayer>(
  players: readonly T[],
  season: string,
  settings: readonly StoredPlayerSeasonSetting[],
) {
  return applyPlayerSeasonSettings(players, season, settings)
    .filter((player) => player.active && !player.hidden && !player.deleted_at);
}
