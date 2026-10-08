import type { StoredPlayerSeasonSetting } from './db';
import { isGuestId } from './guest';

export type SeasonAwarePlayer = {
  id?: string; active?: boolean; pay_fine?: boolean; hidden?: boolean; deleted_at?: unknown;
};
export type SeasonSetting = Pick<StoredPlayerSeasonSetting, 'player_id' | 'season'> & Partial<StoredPlayerSeasonSetting>;
export type SeasonMatch = {
  season?: string | null;
  win_1?: unknown; win_2?: unknown; lose_1?: unknown; lose_2?: unknown;
  deleted_at?: unknown;
};
export function matchPlayerIds(match: SeasonMatch) {
  return [match.win_1, match.win_2, match.lose_1, match.lose_2].filter((id): id is string => typeof id === 'string' && !!id);
}

// Legacy backups infer membership only from actual participation, never global flags.
export function applyPlayerSeasonSettings<T extends SeasonAwarePlayer>(
  players: readonly T[], season: string, settings: readonly SeasonSetting[], matches: readonly SeasonMatch[] = [],
) {
  const byPlayer = new Map(settings.filter(s => s.season === season).map(s => [s.player_id, s]));
  const participants = new Set(matches.filter(m => (m.season || 'Season 1') === season).flatMap(matchPlayerIds));
  return players.filter(p => p.id && (byPlayer.has(p.id) || participants.has(p.id) || isGuestId(p.id))).map(player => {
    const setting = byPlayer.get(player.id!);
    return {
      ...player,
      active: setting ? setting.active !== false : player.active !== false,
      pay_fine: setting ? setting.pay_fine !== false : player.pay_fine !== false,
      hidden: setting ? setting.hidden === true : player.hidden === true,
      deleted_at: setting?.deleted_at || player.deleted_at || null,
    };
  });
}

function selectPlayers<T extends SeasonAwarePlayer>(
  players: readonly T[], season: string | null, settings: readonly SeasonSetting[], matches: readonly SeasonMatch[],
  predicate: (player: SeasonAwarePlayer) => boolean,
) {
  const seasons = season === null
    ? [...new Set([...settings.map(s => s.season), ...matches.map(m => m.season || 'Season 1')])]
    : [season];
  const selected = new Map<string, ReturnType<typeof applyPlayerSeasonSettings<T>>[number]>();
  for (const name of seasons) {
    for (const player of applyPlayerSeasonSettings(players, name, settings, matches)) {
      if (!player.deleted_at && predicate(player)) selected.set(player.id!, player);
    }
  }
  return [...selected.values()];
}
export function selectScorePlayers<T extends SeasonAwarePlayer>(players: readonly T[], season: string | null, settings: readonly SeasonSetting[], matches: readonly SeasonMatch[] = []) {
  return selectPlayers(players, season, settings, matches, p => p.active !== false);
}
export function selectLeaderboardPlayers<T extends SeasonAwarePlayer>(players: readonly T[], season: string | null, settings: readonly SeasonSetting[], matches: readonly SeasonMatch[] = []) {
  return selectPlayers(players, season, settings, matches, p => !p.hidden && !isGuestId(p.id));
}
export function filterSeasonMatches<T extends SeasonMatch>(matches: readonly T[], settings: readonly SeasonSetting[]) {
  const deleted = new Set(settings.filter(s => s.deleted_at).map(s => JSON.stringify([s.season, s.player_id])));
  return matches.filter(m => !m.deleted_at && !matchPlayerIds(m).some(id => deleted.has(JSON.stringify([m.season || 'Season 1', id]))));
}
export function selectAnalysisPlayers<T extends SeasonAwarePlayer>(players: readonly T[], matches: readonly SeasonMatch[]) {
  const ids = new Set(matches.flatMap(matchPlayerIds));
  return players.filter(p => p.id && ids.has(p.id) && !isGuestId(p.id));
}
export function normalizePlayerName(name: string) {
  return name.normalize('NFC').trim().replace(/\s+/gu, ' ');
}
export function playerNameKey(name: string) {
  return normalizePlayerName(name).toLocaleLowerCase('vi');
}
