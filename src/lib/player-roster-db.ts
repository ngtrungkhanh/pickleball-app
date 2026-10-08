import { sql, type VercelPoolClient } from '@vercel/postgres';

// Called explicitly by migration/import/restore, never during page rendering.
// Existing per-season choices win. Legacy rows are inferred from participation.
export async function seedPlayerSeasonRoster(query: VercelPoolClient['sql'] = sql) {
  await query`
    INSERT INTO player_season_settings (player_id, season, active, pay_fine, hidden, deleted_at)
    SELECT DISTINCT p.id, COALESCE(NULLIF(m.season, ''), 'Season 1'),
      COALESCE(p.active, true), COALESCE(p.pay_fine, true), COALESCE(p.hidden, false), p.deleted_at
    FROM matches m JOIN players p ON p.id IN (m.win_1, m.win_2, m.lose_1, m.lose_2)
    ON CONFLICT (player_id, season) DO NOTHING
  `;
  // Preserve unassigned, zero-match legacy members in the current season only.
  await query`
    INSERT INTO player_season_settings (player_id, season, active, pay_fine, hidden, deleted_at)
    SELECT p.id, c.value, COALESCE(p.active, true), COALESCE(p.pay_fine, true), COALESCE(p.hidden, false), p.deleted_at
    FROM players p CROSS JOIN config c
    WHERE c.key = 'active_season'
      AND NOT EXISTS (SELECT 1 FROM player_season_settings ps WHERE ps.player_id = p.id)
    ON CONFLICT (player_id, season) DO NOTHING
  `;
  await query`
    INSERT INTO player_season_settings (player_id, season, active, pay_fine, hidden)
    SELECT p.id, s.name, true, false, true FROM players p CROSS JOIN seasons s
    WHERE p.id = '__GUEST__'
    ON CONFLICT (player_id, season) DO NOTHING
  `;
  // Convert legacy global player deletion into the same per-season tombstones.
  // Independently deleted matches keep their own tombstone.
  await query`
    UPDATE player_season_settings ps SET deleted_at = COALESCE(ps.deleted_at, p.deleted_at)
    FROM players p WHERE p.id = ps.player_id AND p.deleted_at IS NOT NULL
  `;
  await query`
    UPDATE matches m SET deleted_at = NULL, delete_group_id = NULL
    FROM players p WHERE p.deleted_at IS NOT NULL
      AND p.delete_group_id LIKE 'delete-player-%'
      AND m.delete_group_id = p.delete_group_id
      AND p.id IN (m.win_1, m.win_2, m.lose_1, m.lose_2)
  `;
  await query`
    UPDATE players p SET deleted_at = NULL, delete_group_id = NULL
    WHERE p.deleted_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM player_season_settings ps WHERE ps.player_id = p.id)
  `;
}
