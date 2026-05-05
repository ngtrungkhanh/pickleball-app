import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // Check for a secret key to prevent unauthorized access to this route
    // In production, you'd want to secure this properly
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    if (secret !== process.env.SETUP_SECRET && process.env.NODE_ENV === 'production') {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Drop tables if they exist (optional, handle with care)
    // await sql`DROP TABLE IF EXISTS matches;`;
    // await sql`DROP TABLE IF EXISTS players;`;
    // await sql`DROP TABLE IF EXISTS config;`;

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

    return NextResponse.json({ message: 'Database schema created successfully!' }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
