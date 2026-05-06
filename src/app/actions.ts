'use server';
import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';
import { GUEST_ID, GUEST_NAME, isGuestId, matchHasGuest } from '@/lib/guest';

async function ensureSeasonTable() {
  await sql`
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
}

async function ensureConfigTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS config (
      key VARCHAR(50) PRIMARY KEY,
      value VARCHAR(255) NOT NULL
    )
  `;
}

async function ensureSoftDeleteColumns() {
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`;
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS delete_group_id VARCHAR(80)`;
  await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`;
  await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS delete_group_id VARCHAR(80)`;
}

async function ensureGuestPlayer() {
  await ensureSoftDeleteColumns();
  await sql`
    INSERT INTO players (id, name, active)
    VALUES (${GUEST_ID}, ${GUEST_NAME}, true)
    ON CONFLICT (id) DO UPDATE SET name = ${GUEST_NAME}, deleted_at = NULL
  `;

  const { rows } = await sql`
    SELECT id FROM players
    WHERE lower(name) IN ('khách mời', 'khach moi', 'guest')
      AND id <> ${GUEST_ID}
  `;

  for (const row of rows) {
    const oldId = String(row.id);
    await sql`UPDATE matches SET win_1 = ${GUEST_ID} WHERE win_1 = ${oldId}`;
    await sql`UPDATE matches SET win_2 = ${GUEST_ID} WHERE win_2 = ${oldId}`;
    await sql`UPDATE matches SET lose_1 = ${GUEST_ID} WHERE lose_1 = ${oldId}`;
    await sql`UPDATE matches SET lose_2 = ${GUEST_ID} WHERE lose_2 = ${oldId}`;
    await sql`DELETE FROM player_stats WHERE player_id = ${oldId}`;
    await sql`DELETE FROM players WHERE id = ${oldId}`;
  }
}

async function getConfigValue(key: string, fallback: string) {
  try {
    const { rows } = await sql`SELECT value FROM config WHERE key = ${key} LIMIT 1`;
    return rows[0]?.value ?? fallback;
  } catch {
    return fallback;
  }
}

async function setConfigValue(key: string, value: string) {
  await ensureConfigTable();
  await sql`
    INSERT INTO config (key, value)
    VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}


async function updatePlayerStatsIncremental(playerId: string, season: string, deltaWins: number, deltaLosses: number, deltaMoney: number) {
  if (!playerId || isGuestId(playerId)) return;
  await sql`
    INSERT INTO player_stats (player_id, season, wins, losses, total, money)
    VALUES (${playerId}, ${season}, ${deltaWins}, ${deltaLosses}, ${deltaWins + deltaLosses}, ${deltaMoney})
    ON CONFLICT (player_id, season) DO UPDATE SET
      wins = player_stats.wins + EXCLUDED.wins,
      losses = player_stats.losses + EXCLUDED.losses,
      total = player_stats.total + EXCLUDED.total,
      money = player_stats.money + EXCLUDED.money,
      last_updated = NOW()
  `;
}

export async function addMatchAction(formData: FormData) {
  await ensureGuestPlayer();
  const id = `M${Date.now().toString(36).slice(-10)}`.toUpperCase();
  const win_1 = formData.get('win_1') as string;
  const win_2 = (formData.get('win_2') as string) || null;
  const lose_1 = formData.get('lose_1') as string;
  const lose_2 = (formData.get('lose_2') as string) || null;
  const win_score = parseInt(formData.get('win_score') as string);
  const lose_score = parseInt(formData.get('lose_score') as string);
  const season = (formData.get('season') as string) || await getConfigValue('active_season', 'Season 1');
  const created_by = (formData.get('created_by') as string) || 'SYSTEM';

  try {
    const { rows: existing } = await sql`
      SELECT id FROM matches
      WHERE date > NOW() - INTERVAL '15 minutes'
        AND win_1 = ANY(ARRAY[${win_1}, ${win_2 ?? ''}]::text[])
        AND lose_1 = ANY(ARRAY[${lose_1}, ${lose_2 ?? ''}]::text[])
      LIMIT 1
    `;
    if (existing.length > 0) {
      return { error: 'Trận đấu này dường như đã được ghi trong 15 phút gần đây. Vui lòng kiểm tra lại!' };
    }
  } catch {
    // Duplicate check is non-critical; saving can continue.
  }

  try {
    await sql`
      INSERT INTO matches (id, date, win_1, win_2, lose_1, lose_2, win_score, lose_score, season, created_by)
      VALUES (${id}, NOW(), ${win_1}, ${win_2}, ${lose_1}, ${lose_2}, ${win_score}, ${lose_score}, ${season}, ${created_by})
    `;

    const lose_money = parseInt(await getConfigValue('lose_money', '5000'));
    const hasGuest = matchHasGuest({ win_1, win_2, lose_1, lose_2 });

    if (!hasGuest) {
      await updatePlayerStatsIncremental(win_1, season, 1, 0, 0);
      if (win_2) await updatePlayerStatsIncremental(win_2, season, 1, 0, 0);
      await updatePlayerStatsIncremental(lose_1, season, 0, 1, 0);
      if (lose_2) await updatePlayerStatsIncremental(lose_2, season, 0, 1, 0);
    }

    await updatePlayerStatsIncremental(lose_1, season, 0, 0, lose_money);
    if (lose_2) await updatePlayerStatsIncremental(lose_2, season, 0, 0, lose_money);

    await logAudit('ADD_MATCH', `Match ${id} by ${created_by}: ${win_1}${win_2 ? '/' + win_2 : ''} beat ${lose_1}${lose_2 ? '/' + lose_2 : ''} (${win_score}-${lose_score})`);

    revalidatePath('/');
    revalidatePath('/history');
    revalidatePath('/analysis');
    return { success: true };
  } catch (error) {
    console.error('Failed to add match:', error);
    return { error: 'Lỗi khi lưu trận đấu. Vui lòng thử lại.' };
  }
}

export async function deleteMatchAction(matchId: string) {
  try {
    await ensureSoftDeleteColumns();
    const { rows } = await sql`SELECT * FROM matches WHERE id = ${matchId}`;
    if (rows.length === 0) return { error: 'Không tìm thấy trận đấu' };
    const m = rows[0];

    const lose_money = parseInt(await getConfigValue('lose_money', '5000'));
    const hasGuest = matchHasGuest(m);

    // Reverse stats
    if (!hasGuest) {
      await updatePlayerStatsIncremental(m.win_1, m.season, -1, 0, 0);
      if (m.win_2) await updatePlayerStatsIncremental(m.win_2, m.season, -1, 0, 0);
      await updatePlayerStatsIncremental(m.lose_1, m.season, 0, -1, 0);
      if (m.lose_2) await updatePlayerStatsIncremental(m.lose_2, m.season, 0, -1, 0);
    }
    await updatePlayerStatsIncremental(m.lose_1, m.season, 0, 0, -lose_money);
    if (m.lose_2) await updatePlayerStatsIncremental(m.lose_2, m.season, 0, 0, -lose_money);

    const groupId = `delete-match-${matchId}-${Date.now().toString(36)}`;
    await sql`UPDATE matches SET deleted_at = NOW(), delete_group_id = ${groupId} WHERE id = ${matchId}`;

    await logAudit('DELETE_MATCH', `Deleted Match ${matchId}`);

    revalidatePath('/');
    revalidatePath('/history');
    revalidatePath('/analysis');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete match:', error);
    return { error: 'Lỗi khi xóa trận đấu' };
  }
}

export async function addPlayerAction(formData: FormData) {
  try {
    const name = String(formData.get('name') || '').trim();
    if (!name) return { error: 'Tên thành viên không hợp lệ' };

    const id = `P${Date.now().toString(36).slice(-7)}`.toUpperCase();
    await sql`INSERT INTO players (id, name, active) VALUES (${id}, ${name}, true)`;
    
    await logAudit('ADD_PLAYER', `Added player ${name} (${id})`);

    revalidatePath('/');
    revalidatePath('/analysis');
    return { success: true };
  } catch (error) {
    console.error('Failed to add player:', error);
    return { error: 'Lỗi khi thêm thành viên. Kiểm tra lại database/setup.' };
  }
}

export async function updatePlayerAction(formData: FormData) {
  try {
    const id = String(formData.get('id') || '');
    const name = String(formData.get('name') || '').trim();
    const active = String(formData.get('active') || 'true') === 'true';
    if (!id || !name) return { error: 'Thông tin thành viên không hợp lệ' };

    if (isGuestId(id)) {
      await sql`UPDATE players SET name = ${GUEST_NAME}, active = ${active}, deleted_at = NULL WHERE id = ${GUEST_ID}`;
    } else {
      await sql`UPDATE players SET name = ${name}, active = ${active} WHERE id = ${id}`;
    }
    revalidatePath('/');
    revalidatePath('/analysis');
    return { success: true };
  } catch (error) {
    console.error('Failed to update player:', error);
    return { error: 'Lỗi khi lưu thành viên. Kiểm tra lại database/setup.' };
  }
}

export async function updatePlayersAction(formData: FormData) {
  try {
    const ids = formData.getAll('id').map(String);
    const names = formData.getAll('name').map(v => String(v).trim());
    const activeIds = new Set(formData.getAll('active').map(String));

    if (ids.length !== names.length) return { error: 'Danh sách thành viên không hợp lệ' };

    for (let i = 0; i < ids.length; i++) {
      if (!ids[i] || !names[i]) return { error: 'Tên thành viên không hợp lệ' };
      const nextName = isGuestId(ids[i]) ? GUEST_NAME : names[i];
      await sql`UPDATE players SET name = ${nextName}, active = ${activeIds.has(ids[i])} WHERE id = ${ids[i]}`;
    }

    revalidatePath('/');
    revalidatePath('/analysis');
    return { success: true };
  } catch (error) {
    console.error('Failed to update players:', error);
    return { error: 'Lỗi khi lưu danh sách. Kiểm tra lại database/setup.' };
  }
}

async function ensureArchiveTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS archives (
      id SERIAL PRIMARY KEY,
      type VARCHAR(20) NOT NULL,
      original_id VARCHAR(100) NOT NULL,
      name VARCHAR(100),
      data JSONB NOT NULL,
      deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

export async function deletePlayerAction(formData: FormData) {
  try {
    const id = String(formData.get('id') || '').trim();
    if (isGuestId(id)) return { error: 'Không được xóa Khách' };
    if (!id) return { error: 'Thành viên không hợp lệ' };

    await ensureArchiveTable();
    await ensureSoftDeleteColumns();
    await ensureSoftDeleteColumns();

    // Get player info
    const { rows: players } = await sql`SELECT * FROM players WHERE id = ${id}`;
    if (players.length === 0) return { error: 'Không tìm thấy thành viên' };

    // Get all related matches
    const { rows: matches } = await sql`
      SELECT * FROM matches 
      WHERE deleted_at IS NULL
        AND (win_1 = ${id} OR win_2 = ${id} OR lose_1 = ${id} OR lose_2 = ${id})
    `;

    // Archive data
    const archiveData = { player: players[0], matches };
    await sql`
      INSERT INTO archives (type, original_id, name, data)
      VALUES ('PLAYER', ${id}, ${players[0].name}, ${JSON.stringify(archiveData)})
    `;

    const groupId = `delete-player-${id}-${Date.now().toString(36)}`;
    await sql`
      UPDATE matches
      SET deleted_at = NOW(), delete_group_id = ${groupId}
      WHERE deleted_at IS NULL
        AND (win_1 = ${id} OR win_2 = ${id} OR lose_1 = ${id} OR lose_2 = ${id})
    `;
    await sql`UPDATE players SET deleted_at = NOW(), active = false, delete_group_id = ${groupId} WHERE id = ${id}`;
    
    // Also clean up stats for this player
    await sql`DELETE FROM player_stats WHERE player_id = ${id}`;

    await rebuildStatsAction();
    await logAudit('DELETE_PLAYER', `Soft deleted player ${players[0].name} (${id}) and ${matches.length} related matches.`);

    revalidatePath('/');
    revalidatePath('/analysis');
    revalidatePath('/history');
    return { success: true };
  } catch (error) {
    console.error('Failed to destructive delete player:', error);
    return { error: 'Lỗi khi xóa thành viên và dữ liệu liên quan.' };
  }
}

export async function deleteSeasonAction(formData: FormData) {
  try {
    const name = String(formData.get('name') || '').trim();
    if (!name) return { error: 'Season không hợp lệ' };

    await ensureArchiveTable();

    // Get season info
    const { rows: seasons } = await sql`SELECT * FROM seasons WHERE name = ${name}`;
    
    // Get all matches in this season
    const { rows: matches } = await sql`SELECT * FROM matches WHERE season = ${name} AND deleted_at IS NULL`;

    // Archive
    const archiveData = { season: seasons[0] || { name }, matches };
    await sql`
      INSERT INTO archives (type, original_id, name, data)
      VALUES ('SEASON', ${name}, ${name}, ${JSON.stringify(archiveData)})
    `;

    const groupId = `delete-season-${name}-${Date.now().toString(36)}`;
    await sql`UPDATE matches SET deleted_at = NOW(), delete_group_id = ${groupId} WHERE season = ${name} AND deleted_at IS NULL`;
    await sql`UPDATE seasons SET archived = true WHERE name = ${name}`;
    
    // If we deleted the active season, we should probably set another one as active or clear config
    const activeSeason = await getConfigValue('active_season', '');
    if (activeSeason === name) {
      await sql`DELETE FROM config WHERE key = 'active_season'`;
    }

    await rebuildStatsAction();
    revalidatePath('/');
    revalidatePath('/analysis');
    revalidatePath('/history');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete season:', error);
    return { error: 'Lỗi khi xóa Season.' };
  }
}

export async function endSeasonAction() {
  try {
    await ensureSeasonTable();
    
    // Find current active season to determine next name
    const { rows: active } = await sql`SELECT name FROM seasons WHERE active = true LIMIT 1`;
    let nextName = 'Season 1';
    
    if (active.length > 0) {
      const currentName = active[0].name;
      const match = currentName.match(/\d+/);
      if (match) {
        const nextNum = parseInt(match[0]) + 1;
        nextName = currentName.replace(/\d+/, String(nextNum));
      } else {
        nextName = currentName + ' 2';
      }
    }

    // Deactivate all
    await sql`UPDATE seasons SET active = false`;
    
    // Create new
    await sql`
      INSERT INTO seasons (id, name, start_date, active)
      VALUES (${nextName}, ${nextName}, NOW(), true)
      ON CONFLICT (id) DO UPDATE SET active = true, archived = false
    `;
    
    await setConfigValue('active_season', nextName);
    
    revalidatePath('/');
    revalidatePath('/analysis');
    revalidatePath('/history');
    return { success: true };
  } catch (error) {
    console.error('Failed to end season:', error);
    return { error: 'Lỗi khi kết thúc Season.' };
  }
}

export async function createSeasonAction(formData: FormData) {
  try {
    await ensureSeasonTable();
    const name = String(formData.get('name') || '').trim();
    if (!name) return { error: 'Tên Season không hợp lệ' };

    await sql`UPDATE seasons SET active = false WHERE active = true`;
    await sql`
      INSERT INTO seasons (id, name, start_date, active)
      VALUES (${name}, ${name}, NOW(), true)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, active = true, archived = false
    `;
    await setConfigValue('active_season', name);
    revalidatePath('/');
    revalidatePath('/analysis');
    revalidatePath('/history');
    return { success: true };
  } catch (error) {
    console.error('Failed to create season:', error);
    return { error: 'Lỗi khi tạo Season.' };
  }
}

export async function setActiveSeasonAction(formData: FormData) {
  try {
    await ensureSeasonTable();
    const name = String(formData.get('name') || '').trim();
    if (!name) return { error: 'Season không hợp lệ' };

    await sql`UPDATE seasons SET active = false`;
    await sql`
      INSERT INTO seasons (id, name, active)
      VALUES (${name}, ${name}, true)
      ON CONFLICT (id) DO UPDATE SET active = true, archived = false
    `;
    await setConfigValue('active_season', name);
    revalidatePath('/');
    revalidatePath('/analysis');
    revalidatePath('/history');
    return { success: true };
  } catch (error) {
    console.error('Failed to set active season:', error);
    return { error: 'Lỗi khi đặt Season kích hoạt.' };
  }
}

export async function updateFineAction(formData: FormData) {
  try {
    const value = String(formData.get('lose_money') || '').trim();
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) return { error: 'Mức phạt không hợp lệ' };

    await setConfigValue('lose_money', String(Math.round(amount)));
    revalidatePath('/');
    revalidatePath('/analysis');
    return { success: true };
  } catch (error) {
    console.error('Failed to update fine:', error);
    return { error: 'Lỗi khi lưu mức phạt.' };
  }
}

export async function rebuildStatsAction() {
  try {
    // Ensure table exists just in case
    await sql`
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

    const lose_money = parseInt(await getConfigValue('lose_money', '5000')) || 5000;
    
    const { rows: players } = await sql`SELECT id FROM players WHERE deleted_at IS NULL`;
    const validPlayerIds = new Set(players.map(p => p.id).filter(id => !isGuestId(id)));
    
    const { rows: matches } = await sql`SELECT * FROM matches WHERE deleted_at IS NULL`;
    
    const statsMap = new Map<string, { wins: number; losses: number; money: number }>();
    
    for (const m of matches) {
      const season = m.season || 'Season 1';
      const hasGuest = matchHasGuest(m);
      const winners = [m.win_1, m.win_2].filter(pid => pid && validPlayerIds.has(pid));
      const losers = [m.lose_1, m.lose_2].filter(pid => pid && validPlayerIds.has(pid));

      if (!hasGuest) {
        winners.forEach(pid => {
          const key = `${pid}:${season}`;
          const s = statsMap.get(key) || { wins: 0, losses: 0, money: 0 };
          s.wins++;
          statsMap.set(key, s);
        });

        losers.forEach(pid => {
          const key = `${pid}:${season}`;
          const s = statsMap.get(key) || { wins: 0, losses: 0, money: 0 };
          s.losses++;
          statsMap.set(key, s);
        });
      }

      losers.forEach(pid => {
        const key = `${pid}:${season}`;
        const s = statsMap.get(key) || { wins: 0, losses: 0, money: 0 };
        s.money += lose_money;
        statsMap.set(key, s);
      });
    }

    await sql`DELETE FROM player_stats`;
    
    for (const [key, s] of statsMap.entries()) {
      const [playerId, season] = key.split(':');
      await sql`
        INSERT INTO player_stats (player_id, season, wins, losses, total, money)
        VALUES (${playerId}, ${season}, ${s.wins}, ${s.losses}, ${s.wins + s.losses}, ${s.money})
      `;
    }
    
    await logAudit('REBUILD_STATS', `Rebuilt player_stats from ${matches.length} matches`);
    
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Rebuild failed:', error);
    return { error: `Lỗi hệ thống: ${error.message}` };
  }
}

export async function logAudit(type: string, details: string) {
  try {
    await sql`
      INSERT INTO audit_logs (action_type, details)
      VALUES (${type}, ${details})
    `;
  } catch (err) {
    console.warn('Audit log failed (table might be missing):', err);
  }
}

export async function getAuditLogs() {
  try {
    const { rows } = await sql`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100`;
    return rows;
  } catch (error) {
    console.warn('Could not fetch audit logs:', error);
    return [];
  }
}

export async function getArchives() {
  try {
    const { rows } = await sql`SELECT * FROM archives ORDER BY deleted_at DESC LIMIT 50`;
    return rows;
  } catch (error) {
    console.warn('Could not fetch archives:', error);
    return [];
  }
}

export async function restoreFromArchive(archiveId: number) {
  try {
    const { rows } = await sql`SELECT * FROM archives WHERE id = ${archiveId}`;
    if (rows.length === 0) return { error: 'Không tìm thấy dữ liệu lưu trữ' };
    
    const item = rows[0];
    const data = item.data;
    
    if (item.type === 'PLAYER') {
      const p = data.player;
      await sql`INSERT INTO players (id, name, active) VALUES (${p.id}, ${p.name}, ${p.active})`;
      for (const m of data.matches) {
        await sql`
          INSERT INTO matches (id, date, win_1, win_2, lose_1, lose_2, win_score, lose_score, season)
          VALUES (${m.id}, ${m.date}, ${m.win_1}, ${m.win_2}, ${m.lose_1}, ${m.lose_2}, ${m.win_score}, ${m.lose_score}, ${m.season})
          ON CONFLICT (id) DO NOTHING
        `;
      }
      await rebuildStatsAction();
    }
    
    await sql`DELETE FROM archives WHERE id = ${archiveId}`;
    await logAudit('RESTORE', `Restored ${item.type} ${item.name}`);
    
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Restore failed:', error);
    return { error: 'Lỗi khi khôi phục dữ liệu' };
  }
}

export async function verifyAdminAction(pass: string) {
  const adminPass = process.env.ADMIN_PASS || 'khanh'; // Fallback to 'khanh' if env not set
  if (pass === adminPass) {
    return { success: true };
  }
  return { success: false, error: 'Mật khẩu sai' };
}

export async function getMatchesAfterAction(lastId: string) {
  try {
    // If no lastId, return nothing (safety) or all (initial sync)
    if (!lastId) {
      const { rows } = await sql`SELECT * FROM matches WHERE deleted_at IS NULL ORDER BY date ASC`;
      return rows;
    }
    
    // Fetch only matches created after the current lastId
    // We use the date of the lastId to find newer ones
    const { rows: lastMatch } = await sql`SELECT date FROM matches WHERE id = ${lastId} AND deleted_at IS NULL LIMIT 1`;
    if (lastMatch.length === 0) {
      const { rows } = await sql`SELECT * FROM matches WHERE deleted_at IS NULL ORDER BY date ASC`;
      return rows;
    }
    
    const { rows } = await sql`SELECT * FROM matches WHERE deleted_at IS NULL AND date > ${lastMatch[0].date} ORDER BY date ASC`;
    return rows;
  } catch (error) {
    console.error('Fetch incremental matches failed:', error);
    return [];
  }
}

export async function getPlayersAction() {
  try {
    const { rows } = await sql`SELECT * FROM players WHERE deleted_at IS NULL ORDER BY name ASC`;
    return rows;
  } catch (error) {
    console.error('Failed to fetch players:', error);
    return [];
  }
}

export async function getSeasonsAction() {
  try {
    const { rows } = await sql`SELECT * FROM seasons ORDER BY start_date DESC`;
    return rows;
  } catch (error) {
    console.error('Failed to fetch seasons:', error);
    return [];
  }
}

export async function togglePlayerActiveAction(playerId: string, active: boolean) {
  try {
    await sql`UPDATE players SET active = ${active} WHERE id = ${playerId}`;
    await logAudit('UPDATE_PLAYER', `Changed player ${playerId} active status to ${active}`);
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    return { error: 'Lỗi khi cập nhật trạng thái thành viên' };
  }
}

export async function updateMatchAction(formData: FormData) {
  try {
    const id = String(formData.get('id') || '');
    const win_1 = String(formData.get('win_1') || '');
    const win_2 = (formData.get('win_2') as string) || null;
    const lose_1 = String(formData.get('lose_1') || '');
    const lose_2 = (formData.get('lose_2') as string) || null;
    const win_score = parseInt(formData.get('win_score') as string);
    const lose_score = parseInt(formData.get('lose_score') as string);
    const dateStr = String(formData.get('date') || '');

    if (!id || !win_1 || !lose_1) return { error: 'Thông tin trận đấu không hợp lệ' };

    // Get old match first to reverse stats
    const { rows } = await sql`SELECT * FROM matches WHERE id = ${id}`;
    if (rows.length === 0) return { error: 'Không tìm thấy trận đấu cũ' };
    const old = rows[0];

    const lose_money = parseInt(await getConfigValue('lose_money', '5000'));
    const oldHasGuest = matchHasGuest(old);
    const newHasGuest = matchHasGuest({ win_1, win_2, lose_1, lose_2 });

    // 1. Reverse old stats
    if (!oldHasGuest) {
      await updatePlayerStatsIncremental(old.win_1, old.season, -1, 0, 0);
      if (old.win_2) await updatePlayerStatsIncremental(old.win_2, old.season, -1, 0, 0);
      await updatePlayerStatsIncremental(old.lose_1, old.season, 0, -1, 0);
      if (old.lose_2) await updatePlayerStatsIncremental(old.lose_2, old.season, 0, -1, 0);
    }
    await updatePlayerStatsIncremental(old.lose_1, old.season, 0, 0, -lose_money);
    if (old.lose_2) await updatePlayerStatsIncremental(old.lose_2, old.season, 0, 0, -lose_money);

    // 2. Update match details
    const dateVal = dateStr ? new Date(dateStr) : new Date(old.date);
    await sql`
      UPDATE matches 
      SET win_1 = ${win_1}, win_2 = ${win_2}, lose_1 = ${lose_1}, lose_2 = ${lose_2}, 
          win_score = ${win_score}, lose_score = ${lose_score}, date = ${dateVal.toISOString()}
      WHERE id = ${id}
    `;

    // 3. Apply new stats
    if (!newHasGuest) {
      await updatePlayerStatsIncremental(win_1, old.season, 1, 0, 0);
      if (win_2) await updatePlayerStatsIncremental(win_2, old.season, 1, 0, 0);
      await updatePlayerStatsIncremental(lose_1, old.season, 0, 1, 0);
      if (lose_2) await updatePlayerStatsIncremental(lose_2, old.season, 0, 1, 0);
    }
    await updatePlayerStatsIncremental(lose_1, old.season, 0, 0, lose_money);
    if (lose_2) await updatePlayerStatsIncremental(lose_2, old.season, 0, 0, lose_money);

    await logAudit('UPDATE_MATCH', `Updated Match ${id}: ${win_1}${win_2 ? '/' + win_2 : ''} vs ${lose_1}${lose_2 ? '/' + lose_2 : ''} (${win_score}-${lose_score})`);

    revalidatePath('/');
    revalidatePath('/history');
    revalidatePath('/analysis');
    return { success: true };
  } catch (error: any) {
    console.error('Update match failed:', error);
    return { error: 'Lỗi khi sửa trận đấu: ' + error.message };
  }
}
