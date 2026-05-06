const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// 1. Parse .env.local end-to-end to load database connection
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const firstEq = trimmed.indexOf('=');
    if (firstEq === -1) return;
    const key = trimmed.slice(0, firstEq).trim();
    let value = trimmed.slice(firstEq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
  console.log("Loaded .env.local database connection strings.");
} else {
  console.error(".env.local file not found. Database synchronization aborted.");
  process.exit(1);
}

const { sql } = require('@vercel/postgres');

// Helper to convert Excel serial date to JS Date adjusting for local timezone offset
function excelDateToJSDate(excelDate) {
  const tempDate = new Date((excelDate - 25569) * 86400 * 1000);
  const tzOffset = tempDate.getTimezoneOffset() * 60000;
  return new Date(tempDate.getTime() + tzOffset);
}

// Helpers to identify Guest players
const GUEST_ID = '__GUEST__';
function isGuestId(id) {
  return id === GUEST_ID;
}
function matchHasGuest(m) {
  return isGuestId(m.win_1) || isGuestId(m.win_2) || isGuestId(m.lose_1) || isGuestId(m.lose_2);
}

async function run() {
  try {
    const excelPath = path.join(__dirname, 'legacy', 'PICKLEBALL RANKING.xlsx');
    if (!fs.existsSync(excelPath)) {
      console.error("Excel file not found at " + excelPath);
      process.exit(1);
    }

    const fileBuffer = fs.readFileSync(excelPath);
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });

    console.log("\nStarting Clean Sync of Pickleball Database...");

    // 1. Ensure Table Schemas are upgraded and exist
    console.log("Checking and upgrading table schemas...");
    await sql`
      CREATE TABLE IF NOT EXISTS players (
        id VARCHAR(10) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        deleted_at TIMESTAMP,
        delete_group_id VARCHAR(80),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
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
        created_by VARCHAR(50) DEFAULT 'SYSTEM',
        deleted_at TIMESTAMP,
        delete_group_id VARCHAR(80)
      );
    `;
    
    // Add missing columns if any
    try {
      await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS created_by VARCHAR(50) DEFAULT 'SYSTEM';`;
      await sql`ALTER TABLE matches ALTER COLUMN created_by TYPE VARCHAR(50);`;
      await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`;
      await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS delete_group_id VARCHAR(80);`;
      await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`;
      await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS delete_group_id VARCHAR(80);`;
    } catch (err) {
      console.warn("Soft delete columns update:", err.message);
    }

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

    // 2. Erase existing records to avoid constraints/duplicate errors
    console.log("Erasing old database records...");
    await sql`DELETE FROM player_stats;`;
    await sql`DELETE FROM matches;`;
    await sql`DELETE FROM players;`;
    await sql`DELETE FROM config;`;
    await sql`DELETE FROM seasons;`;

    // 3. Migrate PLAYERS sheet
    const playersSheet = workbook.Sheets['PLAYERS'];
    if (playersSheet) {
      const players = xlsx.utils.sheet_to_json(playersSheet);
      console.log(`Migrating ${players.length} players...`);
      for (const p of players) {
        if (!p.player_id) continue;
        const nameVal = p.name || 'Khách';
        const activeVal = p.active === undefined ? true : (p.active === 'TRUE' || p.active === true || p.active === 1);
        await sql`
          INSERT INTO players (id, name, active)
          VALUES (${p.player_id}, ${nameVal}, ${activeVal});
        `;
        console.log(`  - Player ${p.player_id}: ${nameVal} (Active: ${activeVal})`);
      }
    } else {
      console.warn("PLAYERS sheet not found inside Excel!");
    }

    // 4. Migrate MATCHES sheet
    const matchesSheet = workbook.Sheets['MATCHES'];
    let matchesData = [];
    if (matchesSheet) {
      matchesData = xlsx.utils.sheet_to_json(matchesSheet);
      console.log(`Migrating ${matchesData.length} matches...`);
      for (const m of matchesData) {
        if (!m.match_id) continue;
        const date = typeof m.date === 'number' ? excelDateToJSDate(m.date) : new Date(m.date);
        await sql`
          INSERT INTO matches (id, date, win_1, win_2, lose_1, lose_2, win_score, lose_score, season, created_by)
          VALUES (
            ${m.match_id}, 
            ${date.toISOString()}, 
            ${m.win_1}, 
            ${m.win_2 || null}, 
            ${m.lose_1}, 
            ${m.lose_2 || null}, 
            ${m.win_score}, 
            ${m.lose_score}, 
            ${m.season || 'Season 1'},
            'SYSTEM'
          );
        `;
      }
      console.log(`  - Successfully imported ${matchesData.length} matches.`);
    } else {
      console.warn("MATCHES sheet not found inside Excel!");
    }

    // 5. Migrate CONFIG & SETTINGS sheets
    console.log("Migrating config and settings...");
    const configData = {};
    for (const sheetName of ['CONFIG', 'SETTINGS', 'LOG']) {
      const sheet = workbook.Sheets[sheetName];
      if (sheet) {
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        for (const row of rows) {
          if (row.length >= 2 && row[0] && row[0] !== 'key') {
            configData[row[0].toString()] = row[1] !== undefined ? row[1].toString() : '';
          }
        }
      }
    }

    // Apply defaults if they are missing
    if (!configData['active_season']) configData['active_season'] = 'Season 1';
    if (!configData['lose_money']) configData['lose_money'] = '5000';

    for (const [key, value] of Object.entries(configData)) {
      await sql`
        INSERT INTO config (key, value)
        VALUES (${key}, ${value})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
      `;
      console.log(`  - Config [${key}] = ${value}`);
    }

    // 6. Build SEASONS table from matches + active season configuration
    console.log("Seeding seasons...");
    const uniqueSeasons = [...new Set(matchesData.map(m => m.season).filter(Boolean))];
    if (uniqueSeasons.length === 0) uniqueSeasons.push('Season 1');
    const activeSeason = configData['active_season'] || 'Season 1';

    for (const s of uniqueSeasons) {
      const isActive = s === activeSeason;
      await sql`
        INSERT INTO seasons (id, name, active)
        VALUES (${s}, ${s}, ${isActive})
        ON CONFLICT (id) DO UPDATE SET active = EXCLUDED.active;
      `;
      console.log(`  - Season: ${s} (Active: ${isActive})`);
    }

    // 7. Recalculate Player Stats (Incremental Stats Rebuilder)
    console.log("Rebuilding player rankings and stats...");
    const lose_money = parseInt(configData['lose_money'] || '5000') || 5000;
    
    const { rows: playersList } = await sql`SELECT id FROM players WHERE deleted_at IS NULL`;
    const validPlayerIds = new Set(playersList.map(p => p.id).filter(id => !isGuestId(id)));
    
    const statsMap = new Map();
    
    for (const m of matchesData) {
      const season = m.season || 'Season 1';
      const hasGuest = matchHasGuest(m);
      const winners = [m.win_1, m.win_2].filter(pid => pid && validPlayerIds.has(pid));
      const losers = [m.lose_1, m.lose_2].filter(pid => pid && validPlayerIds.has(pid));

      if (!hasGuest) {
        winners.forEach(pid => {
          const key = `${pid}:${season}`;
          const s = statsMap.get(key) || { wins: 0, losses: 0, money: 0 };
          s.wins++;
          statsMap.set(key, s);
        });

        losers.forEach(pid => {
          const key = `${pid}:${season}`;
          const s = statsMap.get(key) || { wins: 0, losses: 0, money: 0 };
          s.losses++;
          statsMap.set(key, s);
        });
      }

      losers.forEach(pid => {
        const key = `${pid}:${season}`;
        const s = statsMap.get(key) || { wins: 0, losses: 0, money: 0 };
        s.money += m.win_score === 11 && m.lose_score === 0 ? lose_money * 2 : lose_money; // standard loss fine
        statsMap.set(key, s);
      });
    }

    for (const [key, s] of statsMap.entries()) {
      const [playerId, season] = key.split(':');
      await sql`
        INSERT INTO player_stats (player_id, season, wins, losses, total, money)
        VALUES (${playerId}, ${season}, ${s.wins}, ${s.losses}, ${s.wins + s.losses}, ${s.money});
      `;
    }
    console.log(`  - Successfully calculated stats for ${statsMap.size} player-season entries.`);
    
    console.log("\nDatabase successfully synchronized with 100% Excel data! All rank tables are completely up-to-date.");
    process.exit(0);
  } catch (error) {
    console.error("\nMigration failed with error:", error.message);
    process.exit(1);
  }
}

run();
