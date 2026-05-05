import { sql } from '@vercel/postgres';
import { ScoreForm } from '@/components/ScoreForm';

export const revalidate = 0;

export default async function AddMatchPage() {
  const { rows } = await sql`SELECT * FROM players WHERE active = true ORDER BY name ASC`;
  
  return (
    <div className="space-y-6 pb-12 relative animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Ghi trận mới</h1>
        <p className="text-secondary-foreground/70 mt-1 font-medium">
          Nhập kết quả trận vừa chơi.
        </p>
      </div>
      <ScoreForm players={rows} />
    </div>
  );
}
