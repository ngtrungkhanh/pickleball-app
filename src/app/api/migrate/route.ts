import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import * as xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import { shouldBlockPreviewWrites } from '@/lib/environment';
import { bumpDataVersions } from '@/lib/data-version';
import { rebuildPlayerStatsFromMatches } from '@/lib/player-stats-rebuild';

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
type SheetRow = Record<string, unknown>;

// Excel serial is treated as Bangkok local time; convert once to UTC for DB storage.
function excelDateToUTCDate(excelDate: number) {
  const excelEpochUtcMs = Date.UTC(1899, 11, 30);
  const millis = Math.round(excelDate * 86400 * 1000);
  return new Date(excelEpochUtcMs + millis - BANGKOK_OFFSET_MS);
}

function parseTextDateAsBangkok(raw: string) {
  const text = raw.trim();
  const m = text.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/
  );
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    const hour = Number(m[4] || 0);
    const minute = Number(m[5] || 0);
    const second = Number(m[6] || 0);
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - BANGKOK_OFFSET_MS);
  }

  // If already explicit UTC string, keep as-is.
  if (/z$/i.test(text) || /[+\-]\d{2}:\d{2}$/.test(text)) {
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // Fallback: parse as local-like and reinterpret as Bangkok local wall-clock.
  const fallback = new Date(text);
  if (Number.isNaN(fallback.getTime())) return null;
  return new Date(
    Date.UTC(
      fallback.getFullYear(),
      fallback.getMonth(),
      fallback.getDate(),
      fallback.getHours(),
      fallback.getMinutes(),
      fallback.getSeconds(),
      fallback.getMilliseconds()
    ) - BANGKOK_OFFSET_MS
  );
}

function parseMatchDate(raw: unknown) {
  if (typeof raw === 'number') return excelDateToUTCDate(raw);
  const parsed = parseTextDateAsBangkok(String(raw || ''));
  return parsed || new Date();
}

function parseSheetBoolean(raw: unknown, fallback = true) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;

  const text = String(raw).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'active'].includes(text)) return true;
  if (['false', '0', 'no', 'n', 'inactive'].includes(text)) return false;
  return fallback;
}

export async function GET(request: Request) {
  try {
    if (shouldBlockPreviewWrites()) {
      return NextResponse.json(
        { error: 'Preview writes are blocked because Preview uses the production database.' },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    if (secret !== process.env.SETUP_SECRET && process.env.NODE_ENV === 'production') {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const filePath = path.join(process.cwd(), 'legacy', 'PICKLEBALL RANKING.xlsx');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Excel file not found' }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    
    // 1. Migrate PLAYERS
    const playersSheet = workbook.Sheets['PLAYERS'];
    if (playersSheet) {
      const players = xlsx.utils.sheet_to_json<SheetRow>(playersSheet);
      for (const p of players) {
        const id = String(p.player_id || '').trim();
        if (!id) continue;
        const name = String(p.name || id).trim() || id;
        const active = parseSheetBoolean(p.active, true);
        await sql`
          INSERT INTO players (id, name, active)
          VALUES (${id}, ${name}, ${active})
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, active = EXCLUDED.active;
        `;
      }
    }

    // 2. Migrate MATCHES
    const matchesSheet = workbook.Sheets['MATCHES'];
    if (matchesSheet) {
      const matches = xlsx.utils.sheet_to_json<SheetRow>(matchesSheet);
      for (const m of matches) {
        const id = String(m.match_id || '').trim();
        if (!id) continue;
        const date = typeof m.date === 'number' ? excelDateToUTCDate(m.date) : parseMatchDate(m.date);
        const win1 = String(m.win_1 || '').trim();
        const win2 = String(m.win_2 || '').trim() || null;
        const lose1 = String(m.lose_1 || '').trim();
        const lose2 = String(m.lose_2 || '').trim() || null;
        const winScore = Number(m.win_score || 0);
        const loseScore = Number(m.lose_score || 0);
        const season = String(m.season || 'Season 1');
        
        await sql`
          INSERT INTO matches (id, date, win_1, win_2, lose_1, lose_2, win_score, lose_score, season)
          VALUES (
            ${id}, 
            ${date.toISOString()}, 
            ${win1}, 
            ${win2}, 
            ${lose1}, 
            ${lose2}, 
            ${winScore}, 
            ${loseScore}, 
            ${season}
          )
          ON CONFLICT (id) DO NOTHING;
        `;
      }
    }

    // 3. Migrate CONFIG & SETTINGS
    const configData: Record<string, string> = {};
    for (const sheetName of ['CONFIG', 'SETTINGS', 'LOG']) {
      const sheet = workbook.Sheets[sheetName];
      if (sheet) {
        const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
        for (const row of rows) {
          if (row.length >= 2 && row[0] && row[0] !== 'key') {
            configData[String(row[0])] = row[1] !== undefined && row[1] !== null ? String(row[1]) : '';
          }
        }
      }
    }

    for (const [key, value] of Object.entries(configData)) {
      await sql`
        INSERT INTO config (key, value)
        VALUES (${key}, ${value})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
      `;
    }

    await rebuildPlayerStatsFromMatches();
    await bumpDataVersions(['matches', 'players', 'seasons', 'config', 'playerSeasonSettings', 'admin']);

    return NextResponse.json({ message: 'Migration completed successfully!' }, { status: 200 });

  } catch (error: unknown) {
    console.error('Migration error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (shouldBlockPreviewWrites()) {
      return NextResponse.json(
        { error: 'Preview writes are blocked because Preview uses the production database.' },
        { status: 403 },
      );
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File xlsx không hợp lệ.' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const workbook = xlsx.read(buf, { type: 'buffer' });
    const matchesSheet = workbook.Sheets['MATCHES'];
    if (!matchesSheet) {
      return NextResponse.json({ error: 'Không tìm thấy sheet MATCHES.' }, { status: 400 });
    }

    const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(matchesSheet);
    const playersSheet = workbook.Sheets['PLAYERS'];
    const playerRows = playersSheet
      ? xlsx.utils.sheet_to_json<Record<string, unknown>>(playersSheet)
      : [];

    const importedPlayerIds = new Set<string>();
    let playersUpserted = 0;
    for (const p of playerRows) {
      const id = String(p.player_id || p.id || '').trim();
      if (!id) continue;

      const name = String(p.name || id).trim() || id;
      const active = parseSheetBoolean(p.active, true);
      importedPlayerIds.add(id);

      await sql`
        INSERT INTO players (id, name, active, deleted_at, delete_group_id)
        VALUES (${id}, ${name}, ${active}, NULL, NULL)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          active = EXCLUDED.active,
          deleted_at = NULL,
          delete_group_id = NULL
      `;
      playersUpserted++;
    }

    const incomingPlayerIds = new Set<string>();
    for (const m of rows) {
      [m.win_1, m.win_2, m.lose_1, m.lose_2]
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .forEach((id) => incomingPlayerIds.add(id));
    }

    if (incomingPlayerIds.size > 0) {
      const existingPlayers = await sql`SELECT id FROM players`;
      const existingSet = new Set(existingPlayers.rows.map((p) => String(p.id)));
      for (const pid of incomingPlayerIds) {
        if (existingSet.has(pid) || importedPlayerIds.has(pid)) continue;
        await sql`
          INSERT INTO players (id, name, active, deleted_at, delete_group_id)
          VALUES (${pid}, ${pid}, true, NULL, NULL)
          ON CONFLICT (id) DO UPDATE SET deleted_at = NULL
        `;
      }
    }

    await sql`DELETE FROM matches`;

    let inserted = 0;
    for (const m of rows) {
      const id = String(m.match_id || '').trim();
      if (!id) continue;
      const date = parseMatchDate(m.date);
      const win_1 = String(m.win_1 || '').trim();
      const win_2 = String(m.win_2 || '').trim() || null;
      const lose_1 = String(m.lose_1 || '').trim();
      const lose_2 = String(m.lose_2 || '').trim() || null;
      const win_score = Number(m.win_score) || 0;
      const lose_score = Number(m.lose_score) || 0;
      const season = String(m.season || 'Season 1');
      const created_by = String(m.created_by || 'MIGRATE_XLSX').slice(0, 50);

      if (!win_1 || !lose_1) continue;

      await sql`
        INSERT INTO matches (id, date, win_1, win_2, lose_1, lose_2, win_score, lose_score, season, created_by, deleted_at, delete_group_id)
        VALUES (${id}, ${date.toISOString()}, ${win_1}, ${win_2}, ${lose_1}, ${lose_2}, ${win_score}, ${lose_score}, ${season}, ${created_by}, NULL, NULL)
      `;
      inserted++;
    }

    await rebuildPlayerStatsFromMatches();

    await bumpDataVersions(['matches', 'players', 'seasons', 'config', 'playerSeasonSettings', 'admin']);

    revalidatePath('/');
    revalidatePath('/analysis');
    revalidatePath('/history');
    revalidatePath('/add-match');

    return NextResponse.json({ success: true, inserted, playersUpserted }, { status: 200 });
  } catch (error: any) {
    console.error('XLSX import error:', error);
    return NextResponse.json({ error: error.message || 'Import thất bại.' }, { status: 500 });
  }
}
