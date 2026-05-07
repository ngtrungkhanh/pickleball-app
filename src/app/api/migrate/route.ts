import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import * as xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import { shouldBlockPreviewWrites } from '@/lib/environment';
import { isGuestId, matchHasGuest } from '@/lib/guest';

// Helper to convert Excel date to JS Date adjusting for local timezone offset
function excelDateToJSDate(excelDate: number) {
  const tempDate = new Date((excelDate - 25569) * 86400 * 1000);
  const tzOffset = tempDate.getTimezoneOffset() * 60000;
  return new Date(tempDate.getTime() + tzOffset);
}

function parseMatchDate(raw: unknown) {
  if (typeof raw === 'number') return excelDateToJSDate(raw);
  const date = new Date(String(raw || ''));
  return Number.isNaN(date.getTime()) ? new Date() : date;
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
      const players = xlsx.utils.sheet_to_json<any>(playersSheet);
      for (const p of players) {
        if (!p.player_id) continue;
        await sql`
          INSERT INTO players (id, name, active)
          VALUES (${p.player_id}, ${p.name}, ${p.active === undefined ? true : p.active})
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, active = EXCLUDED.active;
        `;
      }
    }

    // 2. Migrate MATCHES
    const matchesSheet = workbook.Sheets['MATCHES'];
    if (matchesSheet) {
      const matches = xlsx.utils.sheet_to_json<any>(matchesSheet);
      for (const m of matches) {
        if (!m.match_id) continue;
        const date = typeof m.date === 'number' ? excelDateToJSDate(m.date) : new Date(m.date);
        
        await sql`
          INSERT INTO matches (id, date, win_1, win_2, lose_1, lose_2, win_score, lose_score, season)
          VALUES (
            ${m.match_id}, 
            ${date.toISOString()}, 
            ${m.win_1}, 
            ${m.win_2 || null}, 
            ${m.lose_1}, 
            ${m.lose_2 || null}, 
            ${m.win_score}, 
            ${m.lose_score}, 
            ${m.season}
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
        const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });
        for (const row of rows) {
          if (row.length >= 2 && row[0] && row[0] !== 'key') {
            configData[row[0].toString()] = row[1] !== undefined ? row[1].toString() : '';
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

    return NextResponse.json({ message: 'Migration completed successfully!' }, { status: 200 });

  } catch (error: any) {
    console.error('Migration error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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
        if (existingSet.has(pid)) continue;
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

    const loseMoneyConfig = await sql`SELECT value FROM config WHERE key = 'lose_money' LIMIT 1`;
    const loseMoney = Number(loseMoneyConfig.rows[0]?.value || 5000) || 5000;
    const players = await sql`SELECT id FROM players WHERE deleted_at IS NULL`;
    const validPlayerIds = new Set(players.rows.map((p) => String(p.id)).filter((id) => !isGuestId(id)));
    const allMatches = await sql`SELECT * FROM matches WHERE deleted_at IS NULL`;

    const statsMap = new Map<string, { wins: number; losses: number; money: number }>();
    for (const m of allMatches.rows) {
      const season = String(m.season || 'Season 1');
      const winners = [m.win_1, m.win_2].filter((pid) => pid && validPlayerIds.has(String(pid))).map(String);
      const losers = [m.lose_1, m.lose_2].filter((pid) => pid && validPlayerIds.has(String(pid))).map(String);
      const hasGuest = matchHasGuest(m as any);

      if (!hasGuest) {
        winners.forEach((pid) => {
          const key = `${pid}:${season}`;
          const s = statsMap.get(key) || { wins: 0, losses: 0, money: 0 };
          s.wins += 1;
          statsMap.set(key, s);
        });
        losers.forEach((pid) => {
          const key = `${pid}:${season}`;
          const s = statsMap.get(key) || { wins: 0, losses: 0, money: 0 };
          s.losses += 1;
          statsMap.set(key, s);
        });
      }

      losers.forEach((pid) => {
        const key = `${pid}:${season}`;
        const s = statsMap.get(key) || { wins: 0, losses: 0, money: 0 };
        s.money += loseMoney;
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

    return NextResponse.json({ success: true, inserted }, { status: 200 });
  } catch (error: any) {
    console.error('XLSX import error:', error);
    return NextResponse.json({ error: error.message || 'Import thất bại.' }, { status: 500 });
  }
}
