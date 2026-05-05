'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search } from 'lucide-react';
import { buildElo, buildOpponentRows, buildPartnerRows, getName, getPlayerAnalysis } from '@/lib/analytics';
import { calculateLeaderboard } from '@/lib/stats';
import { cn } from '@/lib/utils';

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

const tabs = ['Tổng quan', 'Player', 'Partner', 'Opponent', 'Trend', 'Match history'];

export function AnalysisCenter({ players, matches, loseMoney = 5000 }: { players: Player[]; matches: Match[]; loseMoney?: number }) {
  const [tab, setTab] = useState(tabs[0]);
  const [playerId, setPlayerId] = useState(players[0]?.id || '');
  const [query, setQuery] = useState('');
  const board = useMemo(() => calculateLeaderboard(players, matches, loseMoney), [players, matches, loseMoney]);
  const elo = useMemo(() => buildElo(players, matches), [players, matches]);
  const partnerRows = useMemo(() => buildPartnerRows(players, matches), [players, matches]);
  const opponentRows = useMemo(() => buildOpponentRows(players, matches), [players, matches]);
  const analysis = useMemo(() => getPlayerAnalysis(playerId, players, matches), [playerId, players, matches]);

  const filteredHistory = matches.filter(m => {
    if (!query.trim()) return true;
    const text = [m.season, getName(players, m.win_1), getName(players, m.win_2), getName(players, m.lose_1), getName(players, m.lose_2)]
      .join(' ')
      .toLowerCase();
    return text.includes(query.toLowerCase());
  });

  return (
    <div className="max-w-[1500px] mx-auto px-4 pb-16 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-black text-white/45 hover:text-primary">
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Link>
        <h1 className="text-2xl sm:text-4xl font-black text-white">Trung tâm phân tích</h1>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn('shrink-0 rounded-xl px-4 py-2 text-xs font-black transition-colors', tab === t ? 'bg-primary text-black' : 'bg-slate-900 text-white/45 border border-white/[0.06]')}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Tổng quan' && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Stat label="Tổng trận" value={matches.length} />
          <Stat label="Thành viên" value={players.length} />
          <Stat label="Top BXH" value={board[0]?.name || '--'} />
          <Stat label="ELO cao nhất" value={`${[...elo.rating.entries()].sort((a, b) => b[1] - a[1])[0]?.[1] ?? 1000}`} />
        </div>
      )}

      {tab === 'Player' && (
        <div className="space-y-4">
          <select value={playerId} onChange={e => setPlayerId(e.target.value)} className="w-full sm:max-w-sm rounded-xl px-4 py-3">
            {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <Stat label="Rank BXH" value={`#${analysis.rank || '--'}`} />
            <Stat label="ELO" value={elo.rating.get(playerId) ?? 1000} />
            <Stat label="Streak" value={analysis.streak} />
            <Stat label="Win rate" value={`${Math.round(analysis.stats?.winRate || 0)}%`} />
            <Stat label="Số trận" value={analysis.stats?.total || 0} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Info title="Best partner" main={analysis.adv.bestPartner?.name || 'Chưa đủ dữ liệu'} sub={analysis.adv.bestPartner ? `${Math.round(analysis.adv.bestPartner.rate)}% thắng` : 'Cần thêm trận'} />
            <Info title="Nemesis" main={analysis.adv.toughestRival?.name || 'Chưa có'} sub={analysis.adv.toughestRival ? `${Math.round(analysis.adv.toughestRival.lossRate)}% thua` : 'Chưa có đối thủ áp đảo'} />
            <Info title="Last match" main={analysis.lastMatch ? `${getName(players, analysis.lastMatch.win_1)} - ${getName(players, analysis.lastMatch.lose_1)}` : 'Chưa có'} sub={analysis.lastMatch?.season || ''} />
          </div>
        </div>
      )}

      {tab === 'Partner' && <DataTable rows={partnerRows.slice(0, 80)} columns={['player', 'partner', 'total', 'wins', 'losses', 'rate']} />}
      {tab === 'Opponent' && <DataTable rows={opponentRows.slice(0, 80)} columns={['player', 'opponent', 'total', 'wins', 'losses', 'rate']} />}
      {tab === 'Trend' && (
        <div className="rounded-2xl border border-white/[0.06] bg-slate-900/80 p-5 text-white/55 font-bold">
          Bản đầu tiên đang tính ELO client-side. Phase sau sẽ thêm biểu đồ ELO, win rate 5/10 trận gần nhất và trend theo thời gian.
        </div>
      )}
      {tab === 'Match history' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Lọc theo tên, đối thủ, bạn đánh cùng, Season..." className="w-full rounded-xl bg-slate-900 border border-white/[0.06] py-3 pl-10 pr-4 text-white" />
          </div>
          <div className="grid gap-2">
            {filteredHistory.slice(0, 120).map(m => (
              <div key={m.id} className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                <div className="text-right text-sm font-bold text-white/80 truncate">{getName(players, m.win_1)}{m.win_2 ? ` / ${getName(players, m.win_2)}` : ''}</div>
                <div className="rounded-lg bg-primary/10 px-3 py-1 text-primary font-black">{m.win_score}-{m.lose_score}</div>
                <div className="text-left text-sm font-bold text-white/80 truncate">{getName(players, m.lose_1)}{m.lose_2 ? ` / ${getName(players, m.lose_2)}` : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/[0.06] bg-slate-900/80 p-4 text-center"><div className="text-xs font-black uppercase tracking-widest text-white/35">{label}</div><div className="mt-2 text-2xl font-black text-white">{value}</div></div>;
}

function Info({ title, main, sub }: { title: string; main: string; sub: string }) {
  return <div className="rounded-2xl border border-white/[0.06] bg-slate-900/80 p-4 text-center"><div className="text-xs font-black uppercase tracking-widest text-white/35">{title}</div><div className="mt-2 text-lg font-black text-white">{main}</div><div className="mt-1 text-sm font-bold text-white/40">{sub}</div></div>;
}

function DataTable({ rows, columns }: { rows: Array<Record<string, string | number>>; columns: string[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-slate-900/80">
      <table className="w-full min-w-[720px]">
        <thead><tr>{columns.map(c => <th key={c} className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-white/35">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-white/[0.04]">{columns.map(c => <td key={c} className="px-4 py-3 text-sm font-bold text-white/75">{c === 'rate' ? `${r[c]}%` : r[c]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
