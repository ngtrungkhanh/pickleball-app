import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { shouldBlockPreviewWrites } from '@/lib/environment';
import { seedPlayerSeasonRoster } from '@/lib/player-roster-db';
import { bumpDataVersions } from '@/lib/data-version';
import { recordAppDataReset } from '@/lib/data-delta';

// Explicit one-off migration; never invoked by a page. Production release needs
// its own approved migration, so this endpoint is deliberately Preview-only.
export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'dev' || shouldBlockPreviewWrites()) {
    return NextResponse.json({ error: 'Chỉ chạy trên Preview dev.' }, { status: 403 });
  }
  const expected = process.env.PLAYER_ROSTER_MIGRATION_TOKEN;
  const provided = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  if (!expected || Buffer.byteLength(provided) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const client = await sql.connect();
  try {
    await client.sql`BEGIN`;
    await client.sql`SELECT pg_advisory_xact_lock(720243)`;
    await client.sql`ALTER TABLE player_season_settings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`;
    await seedPlayerSeasonRoster(client.sql.bind(client));
    const version = await bumpDataVersions(['players', 'matches', 'playerSeasonSettings', 'admin'], client);

    const { rows } = await client.sql`SELECT season, COUNT(*)::int AS members, COUNT(deleted_at)::int AS deleted FROM player_season_settings GROUP BY season ORDER BY season`;
    await client.sql`COMMIT`;
    await recordAppDataReset('matches', version);
    return NextResponse.json({ success: true, seasons: rows });
  } catch {
    await client.sql`ROLLBACK`;
    return NextResponse.json({ error: 'Không thể chuyển danh sách theo mùa.' }, { status: 500 });
  } finally {
    client.release();
  }
}
