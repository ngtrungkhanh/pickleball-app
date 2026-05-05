import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // 1. Create players table
    await sql`
      CREATE TABLE IF NOT EXISTS players (
        id VARCHAR(10) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        active BOOLEAN DEFAULT TRUE,
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
        season VARCHAR(50) NOT NULL
      );
    `;

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 5. Create player_stats table (Incremental Stats)
    await sql`
      CREATE TABLE IF NOT EXISTS player_stats (
        player_id VARCHAR(10) NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        season VARCHAR(50) NOT NULL,
        wins INT DEFAULT 0,
        losses INT DEFAULT 0,
        total INT DEFAULT 0,
        money INT DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, season)
      );
    `;

    // 6. Create audit_logs table
    await sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        action_type VARCHAR(50) NOT NULL,
        details TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 7. Create archives table for Recycle Bin
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
      INSERT INTO config (key, value)
      VALUES ('active_season', 'Season 1'), ('lose_money', '5000')
      ON CONFLICT (key) DO NOTHING;
    `;

    return NextResponse.json({ message: 'Database schema upgraded with Stats and Logs tables!' }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
