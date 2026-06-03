import { isGuestId } from './guest';

export type FinePlayer = {
  id: string;
  pay_fine?: boolean;
};

export type FineMatch = {
  season?: string | null;
  lose_1?: unknown;
  lose_2?: unknown;
};

export type FineSeason = {
  name: string;
  lose_money?: number;
};

export type FinePlayerSeasonSetting = {
  player_id: string;
  season: string;
  pay_fine: boolean;
};

export type FineRules = {
  players?: FinePlayer[];
  seasons?: FineSeason[];
  playerSeasonSettings?: FinePlayerSeasonSetting[];
  fallbackLoseMoney?: number;
};

function seasonNameOf(match: FineMatch) {
  return String(match.season || 'Season 1');
}

export function buildFineLookup({
  players = [],
  seasons = [],
  playerSeasonSettings = [],
  fallbackLoseMoney = 5000,
}: FineRules) {
  const seasonFineByName = new Map(
    seasons.map(season => [
      season.name,
      typeof season.lose_money === 'number' ? season.lose_money : fallbackLoseMoney,
    ]),
  );
  const playerFineById = new Map(players.map(player => [player.id, player.pay_fine !== false]));
  const playerFineBySeason = new Map(
    playerSeasonSettings.map(setting => [`${setting.player_id}:${setting.season}`, setting.pay_fine !== false]),
  );

  return {
    getLoseMoney(match: FineMatch) {
      return seasonFineByName.get(seasonNameOf(match)) ?? fallbackLoseMoney;
    },
    shouldPayFine(playerId: string, match: FineMatch) {
      const season = seasonNameOf(match);
      return playerFineBySeason.get(`${playerId}:${season}`) ?? playerFineById.get(playerId) ?? true;
    },
  };
}

export function calculateFineTotal(matches: FineMatch[], rules: FineRules = {}) {
  const lookup = buildFineLookup(rules);

  let total = 0;
  matches.forEach(match => {
    const loseMoney = lookup.getLoseMoney(match);
    [match.lose_1, match.lose_2].forEach(id => {
      const playerId = typeof id === 'string' ? id : '';
      if (!playerId || isGuestId(playerId) || !lookup.shouldPayFine(playerId, match)) {
        return;
      }
      total += loseMoney;
    });
  });
  return total;
}
