import { buildAnalysisElo } from './analysis-core';
import { isGuestId, isRankingMatch } from './guest';
import { calculateLeaderboard } from './stats';

export type HallOfFamePlayer = {
  id: string;
  name: string;
  active?: boolean;
  [key: string]: unknown;
};

export type HallOfFameMatch = {
  id?: string;
  date?: string;
  win_1?: string;
  win_2?: string | null;
  lose_1?: string;
  lose_2?: string | null;
  win_score?: number;
  lose_score?: number;
  season?: string;
  deleted_at?: unknown;
  [key: string]: unknown;
};

export type HallOfFameSeason = {
  id?: string;
  name: string;
  active?: boolean;
  start_date?: string;
  champion_image_url?: string | null;
  champion_image_path?: string | null;
  champion_image_updated_at?: string | null;
};

export type HallOfFameEntry = {
  season: string;
  playerId: string;
  playerName: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  rating: number;
  lastMatchDate: string;
  imageUrl?: string;
  imagePath?: string;
  imageUpdatedAt?: string;
};

function isFullDoublesHallMatch(match: HallOfFameMatch) {
  return Boolean(match.win_1 && match.win_2 && match.lose_1 && match.lose_2);
}

function matchTimeValue(match: HallOfFameMatch) {
  return new Date(String(match.date || '')).getTime() || 0;
}

export function formatHallDate(date: string) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(value);
}

export function buildHallOfFameEntries(
  players: HallOfFamePlayer[],
  matches: HallOfFameMatch[],
  seasons: HallOfFameSeason[],
  activeSeason: string,
  loseMoney: number
): HallOfFameEntry[] {
  const seasonMeta = new Map(seasons.filter(season => season.name).map(season => [season.name, season]));
  const completedSeasonNames = Array.from(new Set(
    seasons
      .filter(season => season.name && season.name !== activeSeason && season.active !== true)
      .map(season => season.name)
  ));
  const eligiblePlayers = players.filter(player => !isGuestId(player.id));

  return completedSeasonNames
    .map(seasonName => {
      const seasonMatches = matches.filter(match => !match.deleted_at && (match.season || 'Season 1') === seasonName);
      if (seasonMatches.length === 0) return null;

      const board = calculateLeaderboard(eligiblePlayers, seasonMatches, loseMoney)
        .filter(player => !isGuestId(player.id) && player.total > 0);
      const champion = board[0];
      if (!champion) return null;

      const rankingMatches = seasonMatches.filter(match => isRankingMatch(match) && isFullDoublesHallMatch(match));
      const rating = buildAnalysisElo(eligiblePlayers, rankingMatches).rating.get(champion.id) ?? 1000;
      const lastMatch = [...rankingMatches].sort((a, b) => matchTimeValue(b) - matchTimeValue(a))[0];

      const imageMeta = seasonMeta.get(seasonName);
      const entry: HallOfFameEntry = {
        season: seasonName,
        playerId: champion.id,
        playerName: champion.name,
        wins: champion.wins,
        losses: champion.losses,
        total: champion.total,
        winRate: champion.winRate,
        rating,
        lastMatchDate: String(lastMatch?.date || ''),
      };
      if (imageMeta?.champion_image_url) entry.imageUrl = imageMeta.champion_image_url;
      if (imageMeta?.champion_image_path) entry.imagePath = imageMeta.champion_image_path;
      if (imageMeta?.champion_image_updated_at) entry.imageUpdatedAt = imageMeta.champion_image_updated_at;
      return entry;
    })
    .filter((entry): entry is HallOfFameEntry => Boolean(entry))
    .sort((a, b) => {
      const aMeta = seasonMeta.get(a.season);
      const bMeta = seasonMeta.get(b.season);
      const aTime = new Date(String(aMeta?.start_date || a.lastMatchDate || '')).getTime() || 0;
      const bTime = new Date(String(bMeta?.start_date || b.lastMatchDate || '')).getTime() || 0;
      return bTime - aTime || b.season.localeCompare(a.season, 'vi');
    });
}

export function getLatestHallOfFameEntry(entries: HallOfFameEntry[]) {
  return entries[0] || null;
}
