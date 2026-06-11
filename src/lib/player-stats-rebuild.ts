import { sql } from '@vercel/postgres';
import { isGuestId, matchHasGuest } from './guest';

type SqlTag = typeof sql;
type SqlRunner = {
  sql: SqlTag;
};

function db(runner?: SqlRunner) {
  return runner?.sql ? runner.sql.bind(runner) as SqlTag : sql;
}

export async function rebuildPlayerStatsFromMatches(runner?: SqlRunner) {
  const query = db(runner);

  await query`
    CREATE TABLE IF NOT EXISTS config (
      key VARCHAR(50) PRIMARY KEY,
      value VARCHAR(255) NOT NULL
    )
  `;
  await query`
    CREATE TABLE IF NOT EXISTS seasons (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      start_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      end_date TIMESTAMP,
      active BOOLEAN DEFAULT FALSE,
      archived BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await query`
    CREATE TABLE IF NOT EXISTS player_stats (
      player_id VARCHAR(10) NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      season VARCHAR(50) NOT NULL,
      wins INT DEFAULT 0,
      losses INT DEFAULT 0,
      total INT DEFAULT 0,
      money INT DEFAULT 0,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (player_id, season)
    )
  `;
  await query`ALTER TABLE players ADD COLUMN IF NOT EXISTS pay_fine BOOLEAN DEFAULT TRUE`;
  await query`ALTER TABLE players ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`;
  await query`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS lose_money INT DEFAULT 5000`;
  await query`
    CREATE TABLE IF NOT EXISTS player_season_settings (
      player_id VARCHAR(80) NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      season VARCHAR(80) NOT NULL,
      active BOOLEAN DEFAULT TRUE,
      pay_fine BOOLEAN DEFAULT TRUE,
      hidden BOOLEAN DEFAULT FALSE,
      PRIMARY KEY (player_id, season)
    )
  `;

  const { rows: players } = await query`SELECT id, pay_fine FROM players WHERE deleted_at IS NULL`;
  const validPlayerIds = new Set(players.map(player => String(player.id)).filter(id => !isGuestId(id)));
  const playerDefaultPayFine = new Map(players.map(player => [String(player.id), player.pay_fine !== false]));
  const { rows: playerSeasonSettings } = await query`SELECT player_id, season, pay_fine FROM player_season_settings`;
  const playerSeasonPayFine = new Map(
    playerSeasonSettings.map(setting => [`${setting.player_id}:${setting.season}`, setting.pay_fine !== false]),
  );
  const { rows: configRows } = await query`SELECT value FROM config WHERE key = 'lose_money' LIMIT 1`;
  const fallbackLoseMoney = Number(configRows[0]?.value || 5000) || 5000;
  const { rows: seasons } = await query`SELECT name, lose_money FROM seasons WHERE archived = false`;
  const seasonLoseMoney = new Map(
    seasons.map(season => [String(season.name), Number(season.lose_money ?? fallbackLoseMoney)]),
  );
  const { rows: matches } = await query`SELECT * FROM matches WHERE deleted_at IS NULL`;

  const statsMap = new Map<string, { wins: number; losses: number; money: number }>();

  for (const match of matches) {
    const season = String(match.season || 'Season 1');
    const winners = [match.win_1, match.win_2]
      .filter(pid => pid && validPlayerIds.has(String(pid)))
      .map(String);
    const losers = [match.lose_1, match.lose_2]
      .filter(pid => pid && validPlayerIds.has(String(pid)))
      .map(String);
    const hasGuest = matchHasGuest(match);

    if (!hasGuest) {
      winners.forEach(pid => {
        const key = `${pid}:${season}`;
        const stat = statsMap.get(key) || { wins: 0, losses: 0, money: 0 };
        stat.wins++;
        statsMap.set(key, stat);
      });

      losers.forEach(pid => {
        const key = `${pid}:${season}`;
        const stat = statsMap.get(key) || { wins: 0, losses: 0, money: 0 };
        stat.losses++;
        statsMap.set(key, stat);
      });
    }

    losers.forEach(pid => {
      const key = `${pid}:${season}`;
      const stat = statsMap.get(key) || { wins: 0, losses: 0, money: 0 };
      const shouldPayFine = playerSeasonPayFine.get(key) ?? playerDefaultPayFine.get(pid) ?? true;
      if (shouldPayFine) {
        stat.money += seasonLoseMoney.get(season) ?? fallbackLoseMoney;
      }
      statsMap.set(key, stat);
    });
  }

  await query`DELETE FROM player_stats`;

  for (const [key, stat] of statsMap.entries()) {
    const [playerId, season] = key.split(':');
    await query`
      INSERT INTO player_stats (player_id, season, wins, losses, total, money)
      VALUES (${playerId}, ${season}, ${stat.wins}, ${stat.losses}, ${stat.wins + stat.losses}, ${stat.money})
    `;
  }

  return { matches: matches.length, rows: statsMap.size };
}
