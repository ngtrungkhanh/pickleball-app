'use server';
import { sql } from '@vercel/postgres';
import { del, put } from '@vercel/blob';
import { revalidatePath } from 'next/cache';
import { GUEST_ID, GUEST_NAME, isGuestId, matchHasGuest } from '@/lib/guest';
import { previewWriteBlockedResult, shouldBlockPreviewWrites } from '@/lib/environment';
import {
  APP_DATA_PARTS,
  bumpDataVersions,
  ensureConfigTable as ensureSharedConfigTable,
  getAppManifest,
} from '@/lib/data-version';
import { rebuildPlayerStatsFromMatches } from '@/lib/player-stats-rebuild';

async function ensureSeasonTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS seasons (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      start_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      end_date TIMESTAMP,
      active BOOLEAN DEFAULT FALSE,
      archived BOOLEAN DEFAULT FALSE,
      champion_image_url TEXT,
      champion_image_path TEXT,
      champion_image_updated_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

async function ensureChampionImageColumns() {
  await ensureSeasonTable();
  await sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS champion_image_url TEXT`;
  await sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS champion_image_path TEXT`;
  await sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS champion_image_updated_at TIMESTAMP`;
}

async function ensureConfigTable() {
  await ensureSharedConfigTable();
}

async function ensurePlayerSeasonSettingsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS player_season_settings (
      player_id VARCHAR(80) NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      season VARCHAR(80) NOT NULL,
      active BOOLEAN DEFAULT TRUE,
      pay_fine BOOLEAN DEFAULT TRUE,
      hidden BOOLEAN DEFAULT FALSE,
      PRIMARY KEY (player_id, season)
    )
  `;
  await sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS lose_money INT DEFAULT 5000`;
}

async function ensureSoftDeleteColumns() {
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`;
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS delete_group_id VARCHAR(80)`;
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS pay_fine BOOLEAN DEFAULT TRUE`;
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`;
  await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS delete_group_id VARCHAR(80)`;
  await ensurePlayerSeasonSettingsTable();
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

async function getSeasonLoseMoney(season: string) {
  await ensurePlayerSeasonSettingsTable();
  const fallback = parseInt(await getConfigValue('lose_money', '5000')) || 5000;
  const { rows } = await sql`
    SELECT lose_money FROM seasons
    WHERE id = ${season} OR name = ${season}
    LIMIT 1
  `;
  const amount = Number(rows[0]?.lose_money);
  return Number.isFinite(amount) ? amount : fallback;
}


async function updatePlayerStatsIncremental(playerId: string, season: string, deltaWins: number, deltaLosses: number, deltaMoney: number) {
  if (!playerId || isGuestId(playerId)) return;
  
  let moneyToChange = deltaMoney;
  if (deltaMoney !== 0) {
    const { rows } = await sql`
      SELECT COALESCE(pss.pay_fine, p.pay_fine, TRUE) AS pay_fine
      FROM players p
      LEFT JOIN player_season_settings pss
        ON pss.player_id = p.id AND pss.season = ${season}
      WHERE p.id = ${playerId}
      LIMIT 1
    `;
    if (rows[0] && rows[0].pay_fine === false) {
      moneyToChange = 0;
    }
  }

  await sql`
    INSERT INTO player_stats (player_id, season, wins, losses, total, money)
    VALUES (${playerId}, ${season}, ${deltaWins}, ${deltaLosses}, ${deltaWins + deltaLosses}, ${moneyToChange})
    ON CONFLICT (player_id, season) DO UPDATE SET
      wins = player_stats.wins + EXCLUDED.wins,
      losses = player_stats.losses + EXCLUDED.losses,
      total = player_stats.total + EXCLUDED.total,
      money = player_stats.money + EXCLUDED.money,
      last_updated = NOW()
  `;
}

export async function addMatchAction(formData: FormData) {
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

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
  const duplicate_confirmed = String(formData.get('duplicate_confirmed') || '').toLowerCase() === 'true';

  if (!win_1 || !win_2 || !lose_1 || !lose_2) {
    return { error: 'Thiếu người chơi. Cần đủ 4 người.' };
  }

  const normalizeTeam = (a?: string | null, b?: string | null) => [a || '', b || ''].filter(Boolean).sort().join('|');

  try {
    const currentWinTeam = normalizeTeam(win_1, win_2);
    const currentLoseTeam = normalizeTeam(lose_1, lose_2);
    const { rows: recent } = await sql`
      SELECT id, win_1, win_2, lose_1, lose_2 FROM matches
      WHERE date > NOW() - INTERVAL '15 minutes'
        AND season = ${season}
        AND deleted_at IS NULL
      ORDER BY date DESC
      LIMIT 20
    `;

    const isDuplicate = recent.some((m) => {
      const winTeam = normalizeTeam(String(m.win_1 || ''), String(m.win_2 || ''));
      const loseTeam = normalizeTeam(String(m.lose_1 || ''), String(m.lose_2 || ''));
      return winTeam === currentWinTeam && loseTeam === currentLoseTeam;
    });

    if (isDuplicate && !duplicate_confirmed) {
      return { skippedDuplicate: true };
    }
  } catch {
    // Duplicate check is non-critical; saving can continue.
  }

  try {
    const { rows: insertedRows } = await sql`
      INSERT INTO matches (id, date, win_1, win_2, lose_1, lose_2, win_score, lose_score, season, created_by)
      VALUES (${id}, NOW(), ${win_1}, ${win_2}, ${lose_1}, ${lose_2}, ${win_score}, ${lose_score}, ${season}, ${created_by})
      RETURNING id, date, win_1, win_2, lose_1, lose_2, win_score, lose_score, season, created_by
    `;
    const inserted = insertedRows[0];

    const lose_money = await getSeasonLoseMoney(season);
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
    const dataVersion = await bumpDataVersions(['matches', 'admin']);
    const manifest = await getAppManifest();

    revalidatePath('/');
    revalidatePath('/history');
    revalidatePath('/analysis');
    return {
      success: true,
      dataVersion,
      partVersions: manifest.parts,
      match: {
        id: String(inserted.id),
        date: inserted.date ? String(inserted.date) : new Date().toISOString(),
        win_1: String(inserted.win_1 || ''),
        win_2: inserted.win_2 ? String(inserted.win_2) : null,
        lose_1: String(inserted.lose_1 || ''),
        lose_2: inserted.lose_2 ? String(inserted.lose_2) : null,
        win_score: Number(inserted.win_score || 0),
        lose_score: Number(inserted.lose_score || 0),
        season: String(inserted.season || season),
        created_by: String(inserted.created_by || created_by),
      },
    };
  } catch (error) {
    console.error('Failed to add match:', error);
    return { error: 'Lỗi khi lưu trận đấu. Vui lòng thử lại.' };
  }
}
export async function deleteMatchAction(matchId: string) {
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

  try {
    await ensureSoftDeleteColumns();
    const { rows } = await sql`SELECT * FROM matches WHERE id = ${matchId}`;
    if (rows.length === 0) return { error: 'Không tìm thấy trận đấu' };
    const m = rows[0];

    const lose_money = await getSeasonLoseMoney(String(m.season || 'Season 1'));
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
    await bumpDataVersions(['matches', 'admin']);

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
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

  try {
    const name = String(formData.get('name') || '').trim();
    if (!name) return { error: 'Tên thành viên không hợp lệ' };

    const id = `P${Date.now().toString(36).slice(-7)}`.toUpperCase();
    await sql`INSERT INTO players (id, name, active) VALUES (${id}, ${name}, true)`;
    
    await logAudit('ADD_PLAYER', `Added player ${name} (${id})`);
    await bumpDataVersions(['players', 'admin']);

    revalidatePath('/');
    revalidatePath('/analysis');
    return { success: true };
  } catch (error) {
    console.error('Failed to add player:', error);
    return { error: 'Lỗi khi thêm thành viên. Kiểm tra lại database/setup.' };
  }
}

export async function updatePlayerAction(formData: FormData) {
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

  try {
    const id = String(formData.get('id') || '');
    const name = String(formData.get('name') || '').trim();
    const active = String(formData.get('active') || 'true') === 'true';
    const pay_fine = String(formData.get('pay_fine') || 'true') === 'true';
    const hidden = String(formData.get('hidden') || 'false') === 'true';
    if (!id || !name) return { error: 'Thông tin thành viên không hợp lệ' };

    if (isGuestId(id)) {
      await sql`UPDATE players SET name = ${GUEST_NAME}, active = ${active}, deleted_at = NULL WHERE id = ${GUEST_ID}`;
    } else {
      await sql`UPDATE players SET name = ${name}, active = ${active}, pay_fine = ${pay_fine}, hidden = ${hidden} WHERE id = ${id}`;
      await rebuildPlayerStatsFromMatches();
    }
    await bumpDataVersions(['players', 'playerSeasonSettings', 'admin']);
    revalidatePath('/');
    revalidatePath('/analysis');
    return { success: true };
  } catch (error) {
    console.error('Failed to update player:', error);
    return { error: 'Lỗi khi lưu thành viên. Kiểm tra lại database/setup.' };
  }
}

export async function updatePlayersAction(formData: FormData) {
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

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

    await bumpDataVersions(['players', 'playerSeasonSettings', 'admin']);
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
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

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
    await bumpDataVersions(['players', 'matches', 'playerSeasonSettings', 'admin']);

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
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

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
    await bumpDataVersions(['seasons', 'matches', 'config', 'playerSeasonSettings', 'admin']);
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
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

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
    await bumpDataVersions(['seasons', 'config', 'admin']);
    
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
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

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
    await bumpDataVersions(['seasons', 'config', 'admin']);
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
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

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
    await bumpDataVersions(['seasons', 'config', 'admin']);
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
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

  try {
    const value = String(formData.get('lose_money') || '').trim();
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) return { error: 'Mức phạt không hợp lệ' };

    await setConfigValue('lose_money', String(Math.round(amount)));
    await rebuildPlayerStatsFromMatches();
    await bumpDataVersions(['config', 'seasons', 'admin']);
    revalidatePath('/');
    revalidatePath('/analysis');
    return { success: true };
  } catch (error) {
    console.error('Failed to update fine:', error);
    return { error: 'Lỗi khi lưu mức phạt.' };
  }
}

function blobSafeSeasonName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'season';
}

export async function uploadChampionImageAction(formData: FormData) {
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return { error: 'Chưa cấu hình BLOB_READ_WRITE_TOKEN cho Vercel Blob.' };
    }

    await ensureChampionImageColumns();
    const seasonName = String(formData.get('seasonName') || '').trim();
    const file = formData.get('file');
    if (!seasonName) return { error: 'Season không hợp lệ.' };
    if (!(file instanceof File) || file.size <= 0) return { error: 'Ảnh tải lên không hợp lệ.' };

    const allowedTypes = new Set(['image/webp', 'image/jpeg', 'image/png']);
    if (!allowedTypes.has(file.type)) return { error: 'Chỉ hỗ trợ JPG, PNG hoặc WebP.' };
    if (file.size > 1.5 * 1024 * 1024) return { error: 'Ảnh sau xử lý phải nhỏ hơn 1.5MB.' };

    const { rows } = await sql`
      SELECT name, active, champion_image_path
      FROM seasons
      WHERE name = ${seasonName} AND archived = false
      LIMIT 1
    `;
    const season = rows[0];
    if (!season) return { error: 'Không tìm thấy Season.' };
    if (season.active) return { error: 'Season đang diễn ra chưa có ảnh vinh danh.' };

    const pathname = `hall-of-fame/${blobSafeSeasonName(seasonName)}-${Date.now()}.webp`;
    const uploaded = await put(pathname, file, {
      access: 'public',
      contentType: file.type || 'image/webp',
    });

    const oldPath = season.champion_image_path ? String(season.champion_image_path) : '';
    if (oldPath) {
      try {
        await del(oldPath);
      } catch (error) {
        console.warn('Failed to delete old champion image blob:', error);
      }
    }

    await sql`
      UPDATE seasons
      SET champion_image_url = ${uploaded.url},
          champion_image_path = ${uploaded.pathname},
          champion_image_updated_at = NOW()
      WHERE name = ${seasonName}
    `;

    await logAudit('UPLOAD_CHAMPION_IMAGE', `Uploaded Hall of Fame image for ${seasonName}`);
    await bumpDataVersions(['seasons', 'admin']);
    revalidatePath('/');
    revalidatePath('/analysis');
    return { success: true, url: uploaded.url };
  } catch (error) {
    console.error('Failed to upload champion image:', error);
    return { error: 'Lỗi khi tải ảnh vinh danh.' };
  }
}

export async function deleteChampionImageAction(formData: FormData) {
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return { error: 'Chưa cấu hình BLOB_READ_WRITE_TOKEN cho Vercel Blob.' };
    }

    await ensureChampionImageColumns();
    const seasonName = String(formData.get('seasonName') || '').trim();
    if (!seasonName) return { error: 'Season không hợp lệ.' };

    const { rows } = await sql`
      SELECT name, active, champion_image_path
      FROM seasons
      WHERE name = ${seasonName} AND archived = false
      LIMIT 1
    `;
    const season = rows[0];
    if (!season) return { error: 'Không tìm thấy Season.' };
    if (season.active) return { error: 'Season đang diễn ra chưa có ảnh vinh danh.' };

    const oldPath = season.champion_image_path ? String(season.champion_image_path) : '';
    if (oldPath) {
      try {
        await del(oldPath);
      } catch (error) {
        console.warn('Failed to delete champion image blob:', error);
      }
    }

    await sql`
      UPDATE seasons
      SET champion_image_url = NULL,
          champion_image_path = NULL,
          champion_image_updated_at = NULL
      WHERE name = ${seasonName}
    `;

    await logAudit('DELETE_CHAMPION_IMAGE', `Deleted Hall of Fame image for ${seasonName}`);
    await bumpDataVersions(['seasons', 'admin']);
    revalidatePath('/');
    revalidatePath('/analysis');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete champion image:', error);
    return { error: 'Lỗi khi xóa ảnh vinh danh.' };
  }
}

export async function rebuildStatsAction() {
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

  try {
    const result = await rebuildPlayerStatsFromMatches();
    
    await logAudit('REBUILD_STATS', `Rebuilt player_stats from ${result.matches} matches`);
    
    revalidatePath('/');
    return { success: true };
  } catch (error: unknown) {
    console.error('Rebuild failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Lỗi hệ thống: ${message}` };
  }
}

export async function logAudit(type: string, details: string) {
  if (shouldBlockPreviewWrites()) return;

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
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

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
    await bumpDataVersions(['players', 'matches', 'seasons', 'config', 'playerSeasonSettings', 'admin']);
    
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

export async function getAppDataManifestAction() {
  try {
    return await getAppManifest();
  } catch (error) {
    console.error('Fetch app data manifest failed:', error);
    return null;
  }
}

function normalizeRequestedParts(parts?: string[]) {
  const requested = Array.isArray(parts) ? parts : [];
  const valid = APP_DATA_PARTS.filter((part) => requested.includes(part));
  return valid.length > 0 ? valid : [...APP_DATA_PARTS.filter((part) => part !== 'admin')];
}

function normalizePlayerRows(rows: any[]) {
  return rows.map((row) => ({
    id: String(row.id || ''),
    name: String(row.name || ''),
    active: row.active === null ? undefined : Boolean(row.active),
    pay_fine: row.pay_fine === null ? undefined : Boolean(row.pay_fine),
    hidden: row.hidden === null ? undefined : Boolean(row.hidden),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    delete_group_id: row.delete_group_id ? String(row.delete_group_id) : null,
  }));
}

function normalizeMatchRows(rows: any[]) {
  return rows.map((row) => ({
    id: String(row.id || ''),
    date: row.date ? String(row.date) : new Date().toISOString(),
    win_1: String(row.win_1 || ''),
    win_2: row.win_2 ? String(row.win_2) : null,
    lose_1: String(row.lose_1 || ''),
    lose_2: row.lose_2 ? String(row.lose_2) : null,
    win_score: Number(row.win_score || 0),
    lose_score: Number(row.lose_score || 0),
    season: String(row.season || 'Season 1'),
    created_by: String(row.created_by || 'SYSTEM'),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    delete_group_id: row.delete_group_id ? String(row.delete_group_id) : null,
  }));
}

function normalizeSeasonRows(rows: any[]) {
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    active: Boolean(row.active),
    start_date: row.start_date ? String(row.start_date) : undefined,
    champion_image_url: row.champion_image_url ? String(row.champion_image_url) : null,
    champion_image_path: row.champion_image_path ? String(row.champion_image_path) : null,
    champion_image_updated_at: row.champion_image_updated_at ? String(row.champion_image_updated_at) : null,
    lose_money: row.lose_money !== null && row.lose_money !== undefined ? Number(row.lose_money) : 5000,
  }));
}

function normalizePlayerSeasonSettingRows(rows: any[]) {
  return rows.map((row) => ({
    id: `${row.player_id}_${row.season}`,
    player_id: String(row.player_id),
    season: String(row.season),
    active: Boolean(row.active),
    pay_fine: Boolean(row.pay_fine),
    hidden: Boolean(row.hidden),
  }));
}

export async function getAppDataPartsAction(parts?: string[]) {
  try {
    const requestedParts = normalizeRequestedParts(parts);
    const response: {
      players?: ReturnType<typeof normalizePlayerRows>;
      matches?: ReturnType<typeof normalizeMatchRows>;
      config?: Record<string, string>;
      seasons?: ReturnType<typeof normalizeSeasonRows>;
      playerSeasonSettings?: ReturnType<typeof normalizePlayerSeasonSettingRows>;
      manifest: Awaited<ReturnType<typeof getAppManifest>>;
      dataVersion: number;
      partVersions: Awaited<ReturnType<typeof getAppManifest>>['parts'];
    } = {
      manifest: await getAppManifest(),
      dataVersion: 0,
      partVersions: {
        matches: 0,
        players: 0,
        seasons: 0,
        config: 0,
        playerSeasonSettings: 0,
        admin: 0,
      },
    };

    const queries: Array<Promise<void>> = [];

    if (requestedParts.includes('players')) {
      queries.push(sql`SELECT * FROM players WHERE deleted_at IS NULL ORDER BY active DESC, name ASC`
        .then((result) => { response.players = normalizePlayerRows(result.rows); }));
    }
    if (requestedParts.includes('matches')) {
      queries.push(sql`SELECT * FROM matches WHERE deleted_at IS NULL ORDER BY date DESC`
        .then((result) => { response.matches = normalizeMatchRows(result.rows); }));
    }
    if (requestedParts.includes('config')) {
      queries.push(sql`SELECT key, value FROM config`
        .then((result) => {
          const config: Record<string, string> = {};
          result.rows.forEach((row) => {
            config[String(row.key)] = String(row.value);
          });
          response.config = config;
        }));
    }
    if (requestedParts.includes('seasons')) {
      queries.push(sql`SELECT id, name, active, start_date, champion_image_url, champion_image_path, champion_image_updated_at, lose_money FROM seasons WHERE archived = false ORDER BY start_date DESC`
        .then((result) => { response.seasons = normalizeSeasonRows(result.rows); }));
    }
    if (requestedParts.includes('playerSeasonSettings')) {
      queries.push(sql`SELECT * FROM player_season_settings`
        .then((result) => { response.playerSeasonSettings = normalizePlayerSeasonSettingRows(result.rows); }));
    }

    await Promise.all(queries);
    response.manifest = await getAppManifest();
    response.dataVersion = response.manifest.globalVersion;
    response.partVersions = response.manifest.parts;

    return response;
  } catch (error) {
    console.error('Fetch app data parts failed:', error);
    return null;
  }
}

export async function getAppDataAction() {
  try {
    return await getAppDataPartsAction(['players', 'matches', 'config', 'seasons', 'playerSeasonSettings']);
  } catch (error) {
    console.error('Fetch app data failed:', error);
    return null;
  }
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
    await ensureChampionImageColumns();
    const { rows } = await sql`SELECT * FROM seasons ORDER BY start_date DESC`;
    return rows;
  } catch (error) {
    console.error('Failed to fetch seasons:', error);
    return [];
  }
}

export async function togglePlayerActiveAction(playerId: string, active: boolean) {
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

  try {
    await sql`UPDATE players SET active = ${active} WHERE id = ${playerId}`;
    await logAudit('UPDATE_PLAYER', `Changed player ${playerId} active status to ${active}`);
    await bumpDataVersions(['players', 'playerSeasonSettings', 'admin']);
    revalidatePath('/');
    return { success: true };
  } catch {
    return { error: 'Lỗi khi cập nhật trạng thái thành viên' };
  }
}

export async function updateMatchAction(formData: FormData) {
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

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

    const lose_money = await getSeasonLoseMoney(String(old.season || 'Season 1'));
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
    let dateVal: Date;
    if (dateStr && dateStr.includes('T')) {
      // datetime-local gửi về dạng "YYYY-MM-DDTHH:mm" (local time của user)
      // Thêm timezone +07:00 để JavaScript parse đúng giờ Việt Nam, rồi convert sang UTC để lưu
      const [datePart, timePart] = dateStr.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute] = timePart.split(':').map(Number);
      const isoString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`;
      dateVal = new Date(isoString);
    } else {
      dateVal = new Date(old.date);
    }
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
    await bumpDataVersions(['matches', 'admin']);

    revalidatePath('/');
    revalidatePath('/history');
    revalidatePath('/analysis');
    return { success: true };
  } catch (error: unknown) {
    console.error('Update match failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Lỗi khi sửa trận đấu: ${message}` };
  }
}

export async function updatePlayerSeasonSettingsAction(
  playerId: string,
  season: string,
  active: boolean,
  pay_fine: boolean,
  hidden: boolean
) {
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

  try {
    await sql`
      INSERT INTO player_season_settings (player_id, season, active, pay_fine, hidden)
      VALUES (${playerId}, ${season}, ${active}, ${pay_fine}, ${hidden})
      ON CONFLICT (player_id, season) 
      DO UPDATE SET active = EXCLUDED.active, pay_fine = EXCLUDED.pay_fine, hidden = EXCLUDED.hidden
    `;
    await rebuildPlayerStatsFromMatches();
    await logAudit('UPDATE_PLAYER_SEASON_SETTINGS', `Updated settings for player ${playerId} in ${season}: active=${active}, pay_fine=${pay_fine}, hidden=${hidden}`);
    await bumpDataVersions(['playerSeasonSettings', 'admin']);
    revalidatePath('/');
    revalidatePath('/analysis');
    return { success: true };
  } catch (error) {
    console.error('Update player season settings failed:', error);
    return { error: 'Lỗi khi cập nhật cấu hình thành viên cho mùa giải' };
  }
}

export async function updateSeasonFineAction(seasonId: string, loseMoney: number) {
  if (shouldBlockPreviewWrites()) return previewWriteBlockedResult();

  try {
    await sql`
      UPDATE seasons 
      SET lose_money = ${loseMoney}
      WHERE id = ${seasonId}
    `;
    await rebuildPlayerStatsFromMatches();
    await logAudit('UPDATE_SEASON_FINE', `Updated fine amount for season ${seasonId} to ${loseMoney}`);
    await bumpDataVersions(['seasons', 'config', 'admin']);
    revalidatePath('/');
    revalidatePath('/analysis');
    return { success: true };
  } catch (error) {
    console.error('Update season fine failed:', error);
    return { error: 'Lỗi khi cập nhật tiền phạt của mùa giải' };
  }
}

