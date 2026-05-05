import { sql } from '@vercel/postgres';
import { AnalysisCenter } from '@/components/analysis/AnalysisCenter';

export const revalidate = 0;

type Player = { id: string; name: string; active?: boolean };
type Match = {
  id?: string;
  date?: string;
  win_1?: string;
  win_2?: string | null;
  lose_1?: string;
  lose_2?: string | null;
  win_score?: number;
  lose_score?: number;
  season?: string;
};

export default async function AnalysisPage() {
  const { rows: players } = await sql`SELECT * FROM players ORDER BY active DESC, name ASC`;
  const { rows: matches } = await sql`SELECT * FROM matches ORDER BY date DESC LIMIT 500`;
  const { rows: configRows } = await sql`SELECT * FROM config`;
  
  const config: Record<string, string> = {};
  configRows.forEach(row => { config[row.key] = row.value; });
  const loseMoney = Number(config.lose_money || 5000);

  return <AnalysisCenter players={players as Player[]} matches={matches as Match[]} loseMoney={loseMoney} />;
}
