'use server';

import { sql } from '@vercel/postgres';
import { previewWriteBlockedResult, shouldBlockPreviewWrites } from '@/lib/environment';
import { LocDebtItem, LocPlayer, LocRound, LocSession } from '@/lib/loc-core';

export async function ensureLocTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS loc_sessions (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(100) NOT NULL,
      players JSONB NOT NULL DEFAULT '[]',
      version INT NOT NULL DEFAULT 1,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS loc_rounds (
      id VARCHAR(64) PRIMARY KEY,
      session_id VARCHAR(64) NOT NULL,
      round_number INT NOT NULL,
      winner_id VARCHAR(64) NOT NULL,
      debts JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_loc_rounds_session_id ON loc_rounds(session_id);
  `;
}

export async function getLocSessionsListAction(): Promise<LocSession[]> {
  try {
    await ensureLocTables();
    const result = await sql`
      SELECT id, title, players, version, status,
             created_at as "createdAt", updated_at as "updatedAt"
      FROM loc_sessions
      ORDER BY updated_at DESC
      LIMIT 20;
    `;
    return (result.rows || []).map(row => ({
      id: String(row.id),
      title: String(row.title),
      players: (row.players as LocPlayer[]) || [],
      version: Number(row.version) || 1,
      status: (row.status as 'active' | 'closed') || 'active',
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    }));
  } catch (error) {
    console.error('getLocSessionsListAction error:', error);
    return [];
  }
}

export async function getLocSessionAction(sessionId: string): Promise<{
  session: LocSession | null;
  rounds: LocRound[];
}> {
  try {
    await ensureLocTables();
    const sessionRes = await sql`
      SELECT id, title, players, version, status,
             created_at as "createdAt", updated_at as "updatedAt"
      FROM loc_sessions
      WHERE id = ${sessionId}
      LIMIT 1;
    `;

    if (!sessionRes.rows || sessionRes.rows.length === 0) {
      return { session: null, rounds: [] };
    }

    const row = sessionRes.rows[0];
    const session: LocSession = {
      id: String(row.id),
      title: String(row.title),
      players: (row.players as LocPlayer[]) || [],
      version: Number(row.version) || 1,
      status: (row.status as 'active' | 'closed') || 'active',
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };

    const roundsRes = await sql`
      SELECT id, session_id as "sessionId", round_number as "roundNumber",
             winner_id as "winnerId", debts, created_at as "createdAt"
      FROM loc_rounds
      WHERE session_id = ${sessionId}
      ORDER BY round_number ASC;
    `;

    const rounds: LocRound[] = (roundsRes.rows || []).map(r => ({
      id: String(r.id),
      sessionId: String(r.sessionId),
      roundNumber: Number(r.roundNumber),
      winnerId: String(r.winnerId),
      debts: (r.debts as LocDebtItem[]) || [],
      createdAt: new Date(r.createdAt).toISOString(),
    }));

    return { session, rounds };
  } catch (error) {
    console.error('getLocSessionAction error:', error);
    return { session: null, rounds: [] };
  }
}

export async function createLocSessionAction(
  title: string,
  players: LocPlayer[]
): Promise<{ success: boolean; session?: LocSession; error?: string }> {
  if (shouldBlockPreviewWrites()) {
    return { success: false, ...previewWriteBlockedResult() };
  }

  try {
    await ensureLocTables();
    const id = `loc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const finalTitle = title.trim() || `Buổi chơi ${new Date().toLocaleDateString('vi-VN')}`;

    await sql`
      INSERT INTO loc_sessions (id, title, players, version, status, created_at, updated_at)
      VALUES (${id}, ${finalTitle}, ${JSON.stringify(players)}, 1, 'active', NOW(), NOW());
    `;

    const newSession: LocSession = {
      id,
      title: finalTitle,
      players,
      version: 1,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return { success: true, session: newSession };
  } catch (error) {
    console.error('createLocSessionAction error:', error);
    return { success: false, error: 'Không thể tạo buổi chơi mới' };
  }
}

export async function addLocRoundAction(
  sessionId: string,
  winnerId: string,
  debts: LocDebtItem[]
): Promise<{ success: boolean; error?: string }> {
  if (shouldBlockPreviewWrites()) {
    return { success: false, ...previewWriteBlockedResult() };
  }

  try {
    await ensureLocTables();
    const countRes = await sql`
      SELECT COALESCE(MAX(round_number), 0) as max_round
      FROM loc_rounds
      WHERE session_id = ${sessionId};
    `;
    const nextRoundNumber = Number(countRes.rows?.[0]?.max_round || 0) + 1;
    const roundId = `round_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    await sql`
      INSERT INTO loc_rounds (id, session_id, round_number, winner_id, debts, created_at)
      VALUES (${roundId}, ${sessionId}, ${nextRoundNumber}, ${winnerId}, ${JSON.stringify(debts)}, NOW());
    `;

    await sql`
      UPDATE loc_sessions
      SET version = version + 1, updated_at = NOW()
      WHERE id = ${sessionId};
    `;

    return { success: true };
  } catch (error) {
    console.error('addLocRoundAction error:', error);
    return { success: false, error: 'Không thể lưu ván đấu' };
  }
}

export async function deleteLocRoundAction(
  roundId: string,
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  if (shouldBlockPreviewWrites()) {
    return { success: false, ...previewWriteBlockedResult() };
  }

  try {
    await ensureLocTables();
    await sql`
      DELETE FROM loc_rounds
      WHERE id = ${roundId} AND session_id = ${sessionId};
    `;

    await sql`
      UPDATE loc_sessions
      SET version = version + 1, updated_at = NOW()
      WHERE id = ${sessionId};
    `;

    return { success: true };
  } catch (error) {
    console.error('deleteLocRoundAction error:', error);
    return { success: false, error: 'Không thể xóa ván đấu' };
  }
}
