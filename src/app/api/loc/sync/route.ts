import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const res = await sql`
      SELECT version, updated_at as "updatedAt"
      FROM loc_sessions
      WHERE id = ${sessionId}
      LIMIT 1;
    `;

    if (!res.rows || res.rows.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const row = res.rows[0];
    return NextResponse.json(
      {
        version: Number(row.version) || 1,
        updatedAt: new Date(row.updatedAt).toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('API /loc/sync error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
