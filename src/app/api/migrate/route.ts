import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import * as xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';

// Helper to convert Excel date to JS Date
function excelDateToJSDate(excelDate: number) {
  // Excel uses 1900 epoch, JS uses 1970 epoch. 25569 is the difference in days.
  // Multiply by 86400 (seconds in a day) and 1000 (ms in a sec)
  // Note: Excel incorrectly assumes 1900 was a leap year, so we subtract 1 more day (25569 total).
  return new Date((excelDate - 25569) * 86400 * 1000);
}

export async function GET(request: Request) {
  try {
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
