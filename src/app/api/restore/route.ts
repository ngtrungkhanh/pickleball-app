import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { shouldBlockPreviewWrites } from '@/lib/environment';
import { bumpDataVersion } from '@/lib/data-version';

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
      return NextResponse.json({ error: 'File backup không hợp lệ.' }, { status: 400 });
    }

    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'File không đúng định dạng JSON.' }, { status: 400 });
    }

    const { players = [], matches = [], logs = [], archives = [], seasons = [] } = data;

    // Delete in reverse dependency order to prevent FK violations
    await sql`DELETE FROM audit_logs`;
    await sql`DELETE FROM archives`;
    await sql`DELETE FROM matches`;
    await sql`DELETE FROM players`;
    await sql`DELETE FROM seasons`;

    // 1. Restore Seasons
    for (const s of seasons) {
      await sql`
        INSERT INTO seasons (id, name, start_date, end_date, active, archived, created_at)
        VALUES (${s.id}, ${s.name}, ${s.start_date || new Date().toISOString()}, ${s.end_date || null}, ${s.active ? true : false}, ${s.archived ? true : false}, ${s.created_at || new Date().toISOString()})
      `;
    }

    // 2. Restore Players
    for (const p of players) {
      await sql`
        INSERT INTO players (id, name, active, deleted_at, delete_group_id)
        VALUES (${p.id}, ${p.name}, ${p.active ? true : false}, ${p.deleted_at || null}, ${p.delete_group_id || null})
      `;
    }

    // 3. Restore Matches
    for (const m of matches) {
      await sql`
        INSERT INTO matches (id, date, win_1, win_2, lose_1, lose_2, win_score, lose_score, season, created_by, deleted_at, delete_group_id)
        VALUES (${m.id}, ${m.date || new Date().toISOString()}, ${m.win_1}, ${m.win_2 || null}, ${m.lose_1}, ${m.lose_2 || null}, ${m.win_score || 0}, ${m.lose_score || 0}, ${m.season || 'Season 1'}, ${m.created_by || 'SYSTEM'}, ${m.deleted_at || null}, ${m.delete_group_id || null})
      `;
    }

    // 4. Restore Archives
    for (const a of archives) {
      await sql`
        INSERT INTO archives (type, original_id, name, data, deleted_at)
        VALUES (${a.type}, ${a.original_id}, ${a.name || null}, ${JSON.stringify(a.data)}, ${a.deleted_at || new Date().toISOString()})
      `;
    }

    // 5. Restore Logs
    for (const l of logs) {
      await sql`
        INSERT INTO audit_logs (id, action_type, details, created_at)
        VALUES (${l.id}, ${l.action_type}, ${l.details}, ${l.created_at || new Date().toISOString()})
      `;
    }

    // After restoring raw data, trigger rebuild_stats
    // To do this server-side, we must call rebuildStatsAction logic.
    // However, we can just let the frontend call it, or duplicate the rebuild logic here.
    // Given the risk of desync, it's safer to just tell the frontend to call rebuild after success, 
    // or import rebuilding logic if possible.
    // Let's just return success, and the frontend will call rebuildStatsAction.
    await bumpDataVersion();

    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath('/history');
    revalidatePath('/analysis');

    return NextResponse.json({ success: true }, { status: 200 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error('JSON Restore error:', error);
    return NextResponse.json({ error: error.message || 'Khôi phục thất bại.' }, { status: 500 });
  }
}
