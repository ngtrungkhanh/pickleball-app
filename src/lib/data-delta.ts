import { sql } from '@vercel/postgres';
import type { AppDataPart } from './data-version';

export type AppDataChangeOperation = 'upsert' | 'delete' | 'reset';

export type AppDataChange = {
  operation: AppDataChangeOperation;
  entityId: string | null;
  payload: Record<string, unknown> | null;
  version: number;
};

type SqlTag = typeof sql;
type SqlRunner = {
  sql: SqlTag;
};

function db(runner?: SqlRunner) {
  return runner?.sql ? runner.sql.bind(runner) as SqlTag : sql;
}

function errorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
}

export function isMissingDataChangesTable(error: unknown) {
  return errorCode(error) === '42P01';
}

export async function ensureAppDataChangesTable(runner?: SqlRunner) {
  const query = db(runner);
  await query`
    CREATE TABLE IF NOT EXISTS app_data_changes (
      id BIGSERIAL PRIMARY KEY,
      version BIGINT NOT NULL,
      part VARCHAR(40) NOT NULL,
      operation VARCHAR(20) NOT NULL,
      entity_id VARCHAR(120),
      payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await query`
    CREATE INDEX IF NOT EXISTS app_data_changes_part_version_idx
    ON app_data_changes (part, version, id)
  `;
}

export async function recordAppDataChange(
  part: AppDataPart,
  operation: AppDataChangeOperation,
  version: number,
  entityId?: string | null,
  payload?: Record<string, unknown> | null,
  runner?: SqlRunner,
) {
  const query = db(runner);
  const serializedPayload = payload ? JSON.stringify(payload) : null;
  await query`
    INSERT INTO app_data_changes (version, part, operation, entity_id, payload)
    VALUES (
      ${version},
      ${part},
      ${operation},
      ${entityId || null},
      ${serializedPayload}::jsonb
    )
  `;
}

export async function ensureDeltaLogAfterFallback(part: AppDataPart, version: number) {
  try {
    await ensureAppDataChangesTable();
    await recordAppDataChange(part, 'reset', version);
  } catch (error) {
    console.error('Failed to initialize delta log:', error);
  }
}

export async function recordAppDataReset(part: AppDataPart, version: number) {
  try {
    await ensureAppDataChangesTable();
    await recordAppDataChange(part, 'reset', version);
  } catch (error) {
    console.error(`Failed to record ${part} reset:`, error);
  }
}

export async function readAppDataChanges(
  part: AppDataPart,
  sinceVersion: number,
  toVersion: number,
  limit = 50,
): Promise<{ changes: AppDataChange[]; resetRequired: boolean; reason?: string }> {
  if (toVersion <= sinceVersion) {
    return { changes: [], resetRequired: false };
  }

  try {
    const { rows } = await sql`
      SELECT version, operation, entity_id, payload
      FROM app_data_changes
      WHERE part = ${part}
        AND version > ${sinceVersion}
        AND version <= ${toVersion}
      ORDER BY version ASC, id ASC
      LIMIT ${limit + 1}
    `;

    if (rows.length === 0) {
      return { changes: [], resetRequired: true, reason: 'delta_gap' };
    }
    if (rows.length > limit) {
      return { changes: [], resetRequired: true, reason: 'delta_limit' };
    }
    if (rows.some((row) => String(row.operation) === 'reset')) {
      return { changes: [], resetRequired: true, reason: 'delta_reset' };
    }

    const changes = rows.map((row) => ({
      operation: String(row.operation) as AppDataChangeOperation,
      entityId: row.entity_id ? String(row.entity_id) : null,
      payload: row.payload && typeof row.payload === 'object'
        ? row.payload as Record<string, unknown>
        : null,
      version: Number(row.version || 0),
    }));

    if (changes.some((change) => (
      !['upsert', 'delete'].includes(change.operation)
      || !change.entityId
      || (change.operation === 'upsert' && !change.payload)
    ))) {
      return { changes: [], resetRequired: true, reason: 'delta_invalid' };
    }

    return { changes, resetRequired: false };
  } catch (error) {
    if (!isMissingDataChangesTable(error)) {
      console.error(`Failed to read ${part} delta:`, error);
    }
    return { changes: [], resetRequired: true, reason: 'delta_unavailable' };
  }
}
