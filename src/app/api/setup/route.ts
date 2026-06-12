import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { shouldBlockPreviewWrites } from '@/lib/environment';
import { ensureAppDataChangesTable, recordAppDataChange } from '@/lib/data-delta';
import { ensureDataVersionCounter } from '@/lib/data-version';

export async function GET() {
  try {
    if (shouldBlockPreviewWrites()) {
      return NextResponse.json(
        { error: 'Preview writes are blocked because Preview uses the production database.' },
        { status: 403 },
      );
    }

    // 1. Create players table
    await sql`
      CREATE TABLE IF NOT EXISTS players (
        id VARCHAR(10) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        pay_fine BOOLEAN DEFAULT TRUE,
        hidden BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        delete_group_id VARCHAR(80),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 2. Create matches table
    await sql`
      CREATE TABLE IF NOT EXISTS matches (
        id VARCHAR(50) PRIMARY KEY,
        date TIMESTAMP NOT NULL,
        win_1 VARCHAR(10) REFERENCES players(id),
        win_2 VARCHAR(10) REFERENCES players(id),
        lose_1 VARCHAR(10) REFERENCES players(id),
        lose_2 VARCHAR(10) REFERENCES players(id),
        win_score INT NOT NULL,
        lose_score INT NOT NULL,
        season VARCHAR(50) NOT NULL,
        created_by TEXT DEFAULT 'SYSTEM',
        client_request_id VARCHAR(120),
        deleted_at TIMESTAMP,
        delete_group_id VARCHAR(80)
      );
    `;

    // Alter matches table to add created_by if it doesn't exist or increase its length
    try {
      await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT 'SYSTEM';`;
      await sql`ALTER TABLE matches ALTER COLUMN created_by TYPE TEXT;`;
      await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(120);`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS matches_client_request_id_unique ON matches (client_request_id) WHERE client_request_id IS NOT NULL;`;
      await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`;
      await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS delete_group_id VARCHAR(80);`;
      await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`;
      await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS delete_group_id VARCHAR(80);`;
      await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS pay_fine BOOLEAN DEFAULT TRUE;`;
      await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE;`;
    } catch (err) {
      console.warn('created_by column update failed', err);
    }

    // 3. Create config table
    await sql`
      CREATE TABLE IF NOT EXISTS config (
        key VARCHAR(50) PRIMARY KEY,
        value VARCHAR(255) NOT NULL
      );
    `;

    // 4. Create seasons table
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
      );
    `;

    await sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS champion_image_url TEXT;`;
    await sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS champion_image_path TEXT;`;
    await sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS champion_image_updated_at TIMESTAMP;`;

    // 5. Create audit_logs table
    await sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        action_type VARCHAR(50) NOT NULL,
        details TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 6. Create archives table for Recycle Bin
    await sql`
      CREATE TABLE IF NOT EXISTS archives (
        id SERIAL PRIMARY KEY,
        type VARCHAR(20) NOT NULL, -- 'PLAYER' or 'MATCH'
        original_id VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        data JSONB NOT NULL,
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      INSERT INTO seasons (id, name, active)
      VALUES ('Season 1', 'Season 1', true)
      ON CONFLICT (id) DO NOTHING;
    `;

    await sql`
      INSERT INTO players (id, name, active)
      VALUES ('__GUEST__', 'Khách', true)
      ON CONFLICT (id) DO UPDATE SET name = 'Khách', deleted_at = NULL;
    `;

    await sql`
      INSERT INTO config (key, value)
      VALUES ('active_season', 'Season 1'), ('lose_money', '5000')
      ON CONFLICT (key) DO NOTHING;
    `;

    await ensureDataVersionCounter();
    await ensureAppDataChangesTable();
    const { rows: versionRows } = await sql`
      SELECT value FROM config
      WHERE key IN ('version_matches', 'version_global', 'data_version')
      ORDER BY CASE key
        WHEN 'version_matches' THEN 1
        WHEN 'version_global' THEN 2
        ELSE 3
      END
      LIMIT 1
    `;
    const currentMatchVersion = Number(versionRows[0]?.value || 0) || 0;
    const { rows: resetRows } = await sql`
      SELECT id FROM app_data_changes
      WHERE part = 'matches' AND operation = 'reset'
      LIMIT 1
    `;
    if (resetRows.length === 0) {
      await recordAppDataChange('matches', 'reset', currentMatchVersion);
    }

    return NextResponse.json({ message: 'Database schema upgraded with version and change-log tables!' }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
