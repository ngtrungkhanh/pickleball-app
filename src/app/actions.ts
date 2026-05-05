'use server';
import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';

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

async function logAudit(action_type: string, details: string) {
  try {
    await sql`
      INSERT INTO audit_logs (action_type, details)
      VALUES (${action_type}, ${details})
    `;
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}

async function updatePlayerStatsIncremental(playerId: string, season: string, deltaWins: number, deltaLosses: number, deltaMoney: number) {
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
  const id = `M${Date.now().toString(36).slice(-10)}`.toUpperCase();
  const win_1 = formData.get('win_1') as string;
  const win_2 = (formData.get('win_2') as string) || null;
  const lose_1 = formData.get('lose_1') as string;
  const lose_2 = (formData.get('lose_2') as string) || null;
  const win_score = parseInt(formData.get('win_score') as string);
  const lose_score = parseInt(formData.get('lose_score') as string);
  const season = (formData.get('season') as string) || await getConfigValue('active_season', 'Season 1');

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
      INSERT INTO matches (id, date, win_1, win_2, lose_1, lose_2, win_score, lose_score, season)
      VALUES (${id}, NOW(), ${win_1}, ${win_2}, ${lose_1}, ${lose_2}, ${win_score}, ${lose_score}, ${season})
    `;

    const lose_money = parseInt(await getConfigValue('lose_money', '5000'));

    // Update winners
    await updatePlayerStatsIncremental(win_1, season, 1, 0, 0);
    if (win_2) await updatePlayerStatsIncremental(win_2, season, 1, 0, 0);

    // Update losers
    await updatePlayerStatsIncremental(lose_1, season, 0, 1, lose_money);
    if (lose_2) await updatePlayerStatsIncremental(lose_2, season, 0, 1, lose_money);

    await logAudit('ADD_MATCH', `Match ${id}: ${win_1}${win_2 ? '/' + win_2 : ''} beat ${lose_1}${lose_2 ? '/' + lose_2 : ''} (${win_score}-${lose_score})`);

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
    const { rows } = await sql`SELECT * FROM matches WHERE id = ${matchId}`;
    if (rows.length === 0) return { error: 'Không tìm thấy trận đấu' };
    const m = rows[0];

    const lose_money = parseInt(await getConfigValue('lose_money', '5000'));

    // Reverse stats
    await updatePlayerStatsIncremental(m.win_1, m.season, -1, 0, 0);
    if (m.win_2) await updatePlayerStatsIncremental(m.win_2, m.season, -1, 0, 0);
    await updatePlayerStatsIncremental(m.lose_1, m.season, 0, -1, -lose_money);
    if (m.lose_2) await updatePlayerStatsIncremental(m.lose_2, m.season, 0, -1, -lose_money);

    await sql`DELETE FROM matches WHERE id = ${matchId}`;

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

    await sql`UPDATE players SET name = ${name}, active = ${active} WHERE id = ${id}`;
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
      await sql`UPDATE players SET name = ${names[i]}, active = ${activeIds.has(ids[i])} WHERE id = ${ids[i]}`;
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
    if (!id) return { error: 'Thành viên không hợp lệ' };

    await ensureArchiveTable();

    // Get player info
    const { rows: players } = await sql`SELECT * FROM players WHERE id = ${id}`;
    if (players.length === 0) return { error: 'Không tìm thấy thành viên' };

    // Get all related matches
    const { rows: matches } = await sql`
      SELECT * FROM matches 
      WHERE win_1 = ${id} OR win_2 = ${id} OR lose_1 = ${id} OR lose_2 = ${id}
    `;

    // Archive data
    const archiveData = { player: players[0], matches };
    await sql`
      INSERT INTO archives (type, original_id, name, data)
      VALUES ('PLAYER', ${id}, ${players[0].name}, ${JSON.stringify(archiveData)})
    `;

    // Delete matches first due to potential (though not explicit here) constraints, 
    // and to be clean.
    await sql`DELETE FROM matches WHERE win_1 = ${id} OR win_2 = ${id} OR lose_1 = ${id} OR lose_2 = ${id}`;
    await sql`DELETE FROM players WHERE id = ${id}`;
    
    // Also clean up stats for this player
    await sql`DELETE FROM player_stats WHERE player_id = ${id}`;

    await logAudit('DELETE_PLAYER', `Deleted player ${players[0].name} (${id}) and archived their data.`);

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
    const { rows: matches } = await sql`SELECT * FROM matches WHERE season = ${name}`;

    // Archive
    const archiveData = { season: seasons[0] || { name }, matches };
    await sql`
      INSERT INTO archives (type, original_id, name, data)
      VALUES ('SEASON', ${name}, ${name}, ${JSON.stringify(archiveData)})
    `;

    // Delete
    await sql`DELETE FROM matches WHERE season = ${name}`;
    await sql`DELETE FROM seasons WHERE name = ${name}`;
    
    // If we deleted the active season, we should probably set another one as active or clear config
    const activeSeason = await getConfigValue('active_season', '');
    if (activeSeason === name) {
      await sql`DELETE FROM config WHERE key = 'active_season'`;
    }

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
    const lose_money = parseInt(await getConfigValue('lose_money', '5000'));
    
    // 1. Truncate stats table
    await sql`TRUNCATE player_stats`;
    
    // 2. Fetch all matches
    const { rows: matches } = await sql`SELECT * FROM matches`;
    
    // 3. Re-calculate everything
    for (const m of matches) {
      const season = m.season || 'Season 1';
      // Winners
      await updatePlayerStatsIncremental(m.win_1, season, 1, 0, 0);
      if (m.win_2) await updatePlayerStatsIncremental(m.win_2, season, 1, 0, 0);
      // Losers
      await updatePlayerStatsIncremental(m.lose_1, season, 0, 1, lose_money);
      if (m.lose_2) await updatePlayerStatsIncremental(m.lose_2, season, 0, 1, lose_money);
    }
    
    await logAudit('REBUILD_STATS', `Rebuilt player_stats from ${matches.length} matches`);
    
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Rebuild failed:', error);
    return { error: 'Lỗi khi đồng bộ lại số liệu.' };
  }
}

export async function getAuditLogs() {
  const { rows } = await sql`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100`;
  return rows;
}

export async function getArchives() {
  const { rows } = await sql`SELECT * FROM archives ORDER BY deleted_at DESC LIMIT 50`;
  return rows;
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
