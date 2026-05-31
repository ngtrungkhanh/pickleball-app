'use client';
import { useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { History, Clock, X, Trash2, Calendar, AlertTriangle, Loader2 } from 'lucide-react';
import { deleteMatchAction } from '@/app/actions';
import { isGuestId } from '@/lib/guest';

type PlayerNameMode = 'full' | 'tiny';
type DayMatchGroup = {
  key: string;
  dateLabel: string;
  isToday: boolean;
  matches: any[];
};

function normalizedName(value: unknown) {
  const fullName = String(value || '').replace(/\s+/g, ' ').trim();
  return fullName;
}

function nameParts(value: unknown) {
  return normalizedName(value).split(' ').filter(Boolean);
}

function fitLabel(value: string, maxChars: number) {
  const chars = Array.from(value);
  if (chars.length <= maxChars) return value;
  if (maxChars <= 3) return chars.slice(0, maxChars).join('');
  return `${chars.slice(0, maxChars - 3).join('')}...`;
}

function givenNameOf(value: unknown) {
  const parts = nameParts(value);
  return parts[parts.length - 1] || normalizedName(value);
}

function tinyPlayerName(players: any[], fullName: string) {
  if (!fullName) return '--';

  const givenName = givenNameOf(fullName);
  const normalizedGiven = givenName.toLocaleLowerCase('vi-VN');
  const hasDuplicateGivenName = players.some(player =>
    normalizedName(player?.name) !== fullName &&
    givenNameOf(player?.name).toLocaleLowerCase('vi-VN') === normalizedGiven
  );

  if (!hasDuplicateGivenName) return fitLabel(givenName, 7);

  const initials = nameParts(fullName)
    .slice(0, -1)
    .slice(0, 2)
    .map(part => Array.from(part)[0]?.toLocaleUpperCase('vi-VN'))
    .filter(Boolean)
    .join('.');

  return fitLabel(initials ? `${initials}.${givenName}` : givenName, 9);
}

function playerName(players: any[], id: string, mode: PlayerNameMode = 'full') {
  if (isGuestId(id)) return 'Khách';
  const fullName = players.find(p => p.id === id)?.name ?? id;
  if (mode === 'tiny') return tinyPlayerName(players, fullName);
  return fullName;
}

function MobilePlayerName({ players, id, className }: { players: any[]; id: string; className?: string }) {
  const fullName = playerName(players, id);
  return (
    <span className={cn('block sm:hidden', className)} data-mobile-player-name title={fullName}>
      {playerName(players, id, 'tiny')}
    </span>
  );
}

function CompactRecentPlayerName({ players, id, className }: { players: any[]; id: string; className?: string }) {
  const fullName = playerName(players, id);
  return (
    <span className={cn('block truncate', className)} data-mobile-player-name title={fullName}>
      <span className="sm:hidden">{playerName(players, id, 'tiny')}</span>
      <span className="hidden sm:inline">{fullName}</span>
    </span>
  );
}

function dateKeyOf(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDayDate(value: Date | string) {
  return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function groupMatchesByDay(matches: any[]): DayMatchGroup[] {
  const todayKey = dateKeyOf(new Date());
  const groups = new Map<string, DayMatchGroup>();

  matches.forEach(match => {
    const key = dateKeyOf(match.date);
    const current = groups.get(key);
    if (current) {
      current.matches.push(match);
      return;
    }

    groups.set(key, {
      key,
      dateLabel: formatDayDate(match.date),
      isToday: key === todayKey,
      matches: [match],
    });
  });

  return Array.from(groups.values());
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────
function ConfirmDelete({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300" onClick={onCancel} />
      <div className="relative rounded-[2.5rem] border border-red-500/20 bg-slate-950 shadow-2xl p-8 max-w-sm w-full animate-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <div>
            <h3 className="font-black text-white text-xl tracking-tight">Xóa trận đấu?</h3>
            <p className="text-white/30 text-sm font-bold mt-2 leading-relaxed">Hành động này không thể hoàn tác. Lịch sử trận sẽ biến mất vĩnh viễn.</p>
          </div>
          <div className="flex gap-3 w-full">
            <button onClick={onCancel}
              className="flex-1 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white/40 font-black text-xs uppercase tracking-widest transition-all active:scale-95">
              Hủy
            </button>
            <button onClick={onConfirm}
              className="flex-1 py-4 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-red-500/20 transition-all active:scale-95">
              Xóa ngay
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({ matches, players, onClose, canEdit, matchExpected }: { matches: any[]; players: any[]; onClose: () => void; canEdit: boolean; matchExpected?: any }) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [member1, setMember1] = useState('');
  const [member2, setMember2] = useState('');
  const [relation, setRelation] = useState<'-' | 'partner' | 'opponent'>('-');
  const [result, setResult] = useState<'-' | 'win' | 'loss'>('-');
  const [, start] = useTransition();

  const playerOptions = players.filter(p => p.active !== false && !p.deleted_at);
  const ids = (m: any) => [m.win_1, m.win_2, m.lose_1, m.lose_2].filter(Boolean);
  const team = (m: any, id: string) => ([m.win_1, m.win_2].includes(id) ? 'win' : [m.lose_1, m.lose_2].includes(id) ? 'loss' : null);
  const filteredMatches = matches.filter(m => {
    if (member1 && !ids(m).includes(member1)) return false;
    if (member2 && !ids(m).includes(member2)) return false;
    if (member1 && member2 && relation !== '-') {
      const t1 = team(m, member1);
      const t2 = team(m, member2);
      if (!t1 || !t2) return false;
      if (relation === 'partner' && t1 !== t2) return false;
      if (relation === 'opponent' && t1 === t2) return false;
    }
    if (member1 && result !== '-' && team(m, member1) !== result) return false;
    return true;
  });

  const memberSummary = member1 && !isGuestId(member1)
    ? filteredMatches.reduce((acc, m) => {
      const t = team(m, member1);
      if (t === 'win') acc.wins++;
      if (t === 'loss') acc.losses++;
      return acc;
    }, { wins: 0, losses: 0 })
    : null;
  const summaryTotal = memberSummary ? memberSummary.wins + memberSummary.losses : 0;
  const wr = summaryTotal ? ((memberSummary!.wins / summaryTotal) * 100).toFixed(1) : '0.0';

  const grouped: Record<string, any[]> = {};
  filteredMatches.forEach(m => { (grouped[m.season ?? 'Season 1'] ??= []).push(m); });

  return (
    <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose} />
      {deleteTarget && (
        <ConfirmDelete
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const id = deleteTarget;
            setDeleteTarget(null);
            setIsDeletingId(id);
            start(async () => {
              await deleteMatchAction(id);
              setIsDeletingId(null);
            });
          }}
        />
      )}
      <div className="relative flex flex-col w-full sm:max-w-2xl h-[92vh] sm:h-auto sm:max-h-[85vh] bg-slate-950 sm:rounded-3xl rounded-t-[2.5rem] border border-white/[0.08] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 duration-300">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <History className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-black text-lg text-white tracking-tight">Lịch sử trận đấu</h2>
              <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest mt-0.5">{matches.length} trận đấu được ghi lại</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all active:scale-90">
            <X className="w-5 h-5 text-white/50" />
          </button>
        </div>
        <div className="border-b border-white/[0.06] px-4 sm:px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select value={member1} onChange={e => { const v = e.target.value; setMember1(v); if (!v) setResult('-'); if (v && v === member2) setMember2(''); }} className="rounded-xl bg-slate-900 border border-white/[0.08] px-3 py-2 text-xs font-bold text-white/80">
              <option value="">Thành viên 1</option>
              {playerOptions.map(p => <option key={p.id} value={p.id}>{isGuestId(p.id) ? 'Khách' : p.name}</option>)}
            </select>
            <select value={member2} onChange={e => { const v = e.target.value; setMember2(v === member1 ? '' : v); if (!member1 || !v || v === member1) setRelation('-'); }} className="rounded-xl bg-slate-900 border border-white/[0.08] px-3 py-2 text-xs font-bold text-white/80">
              <option value="">Thành viên 2</option>
              {playerOptions.filter(p => p.id !== member1).map(p => <option key={p.id} value={p.id}>{isGuestId(p.id) ? 'Khách' : p.name}</option>)}
            </select>
            <select value={relation} disabled={!member1 || !member2} onChange={e => setRelation(e.target.value as typeof relation)} className="rounded-xl bg-slate-900 border border-white/[0.08] px-3 py-2 text-xs font-bold text-white/80 disabled:opacity-35">
              <option value="-">Quan hệ</option>
              <option value="partner">Hợp tác</option>
              <option value="opponent">Đối đầu</option>
            </select>
            <select value={result} disabled={!member1} onChange={e => setResult(e.target.value as typeof result)} className="rounded-xl bg-slate-900 border border-white/[0.08] px-3 py-2 text-xs font-bold text-white/80 disabled:opacity-35">
              <option value="-">Kết quả</option>
              <option value="win">Thắng</option>
              <option value="loss">Thua</option>
            </select>
          </div>
          <div className="text-[11px] font-black text-white/35 uppercase tracking-widest">
            Đang hiện {filteredMatches.length}/{matches.length} trận
            {memberSummary && ` · ${memberSummary.wins}W / ${memberSummary.losses}L · WR ${wr}%`}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {Object.entries(grouped).map(([season, list]) => (
            <div key={season} className="space-y-4">
              <div className="flex items-center gap-3 px-1">
                <span className="text-[10px] font-black text-primary px-3 py-1 bg-primary/10 rounded-full uppercase tracking-[0.2em]">{season}</span>
                <div className="h-px flex-1 bg-white/[0.05]" />
                <span className="text-[10px] text-white/20 font-bold uppercase tracking-widest">{list.length} trận</span>
              </div>
              <div className="space-y-6">
                {groupMatchesByDay(list).map(day => (
                  <div key={day.key} className="space-y-3">
                    <div className={cn(
                      'overflow-hidden rounded-xl border px-3 py-2.5 shadow-sm',
                      day.isToday
                        ? 'border-primary/25 bg-emerald-950/70 shadow-primary/5'
                        : 'border-white/[0.07] bg-slate-900/95 shadow-black/10'
                    )}>
                      <div className={cn(
                        'absolute inset-y-0 left-0 w-1',
                        day.isToday ? 'bg-primary' : 'bg-white/15'
                      )} />
                      <div className="flex items-center justify-between gap-3 pl-1">
                        <div className="min-w-0 flex items-center gap-2">
                          <Calendar className={cn('w-3.5 h-3.5 shrink-0', day.isToday ? 'text-primary' : 'text-white/35')} />
                          <span className={cn(
                            'truncate text-[11px] font-black uppercase tracking-[0.18em]',
                            day.isToday ? 'text-primary' : 'text-white/50'
                          )}>
                            {day.isToday ? 'Hôm nay' : day.dateLabel}
                          </span>
                          {day.isToday && (
                            <span className="shrink-0 text-[10px] font-black text-primary/45 tabular-nums">
                              {day.dateLabel}
                            </span>
                          )}
                        </div>
                        <span className={cn(
                          'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest tabular-nums',
                        day.isToday
                          ? 'border-primary/25 bg-primary/10 text-primary'
                          : 'border-white/[0.08] bg-white/[0.04] text-white/40'
                        )}>
                          {day.matches.length} trận
                        </span>
                      </div>
                    </div>
                    <div className={cn('space-y-2 border-l-2 pl-3.5', day.isToday ? 'border-primary/35' : 'border-white/[0.07]')}>
                      {day.matches.map((m: any) => (
                        <MatchCard key={m.id} m={m} players={players} canEdit={canEdit} isDeleting={isDeletingId === m.id} onDelete={() => setDeleteTarget(m.id)} matchExpected={matchExpected} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Shared match card (used in modal) ───────────────────────────────────────
function MatchCard({ m, players, onDelete, canEdit, isDeleting, matchExpected }: { m: any; players: any[]; onDelete: () => void; canEdit: boolean; isDeleting?: boolean; matchExpected?: any }) {
  const name = (id: string, mode: PlayerNameMode = 'full') => playerName(players, id, mode);
  const d = new Date(m.date);
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  const expected = matchExpected?.get(m.id);
  return (
    <div className="group rounded-2xl border border-white/[0.04] bg-white/[0.015] hover:bg-white/[0.03] transition-all overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.03]">
        <span className="text-[10px] font-bold text-white/25 flex items-center gap-1.5 uppercase tracking-widest">
          <Calendar className="w-3 h-3 opacity-40" />{date}<span className="mx-1 opacity-20">·</span><Clock className="w-3 h-3 opacity-40" />{time}
        </span>
        {canEdit && (
          <button disabled={isDeleting} onClick={onDelete} className={cn("text-white/10 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-all active:scale-90", isDeleting && "opacity-50 pointer-events-none")}>
            {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      <div className="px-4 py-4 flex items-center gap-3" data-mobile-match-row>
        <div className="flex-1 min-w-0 text-right space-y-0.5">
          <MobilePlayerName players={players} id={m.win_1} className="text-sm font-black text-white/90 truncate" />
          <div className="hidden text-sm font-black text-white/90 truncate sm:block">{name(m.win_1)}</div>
          {m.win_2 && (
            <>
              <MobilePlayerName players={players} id={m.win_2} className="text-sm font-black text-white/90 truncate" />
              <div className="hidden text-sm font-black text-white/90 truncate sm:block">{name(m.win_2)}</div>
            </>
          )}
        </div>
        <div className="flex flex-col items-center shrink-0">
          <div className="px-4 py-2 rounded-2xl bg-primary/10 border border-primary/20 text-primary font-black text-sm tabular-nums shadow-lg shadow-primary/5">
            <span data-mobile-score>{m.win_score}–{m.lose_score}</span>
          </div>
          {expected && (
            <span className="text-[9px] font-bold text-white/30 mt-1 block tracking-tight whitespace-nowrap">
              <span className="sm:hidden">{Math.round(expected.winProb * 100)}% - {Math.round(expected.loseProb * 100)}%</span>
              <span className="hidden sm:inline">Dự đoán trước trận: {Math.round(expected.winProb * 100)}% - {Math.round(expected.loseProb * 100)}%</span>
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0 text-left space-y-0.5">
          <MobilePlayerName players={players} id={m.lose_1} className="text-sm font-black text-white/90 truncate" />
          <div className="hidden text-sm font-black text-white/90 truncate sm:block">{name(m.lose_1)}</div>
          {m.lose_2 && (
            <>
              <MobilePlayerName players={players} id={m.lose_2} className="text-sm font-black text-white/90 truncate" />
              <div className="hidden text-sm font-black text-white/90 truncate sm:block">{name(m.lose_2)}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main RecentHistory ───────────────────────────────────────────────────────
export function RecentHistory({ matches, players, canEdit = false, matchExpected }: { matches: any[]; players: any[]; canEdit?: boolean; matchExpected?: any }) {
  const [showAll, setShowAll] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [, start] = useTransition();
  const name = (id: string, mode: PlayerNameMode = 'full') => playerName(players, id, mode);

  if (matches.length === 0) return (
    <div className="rounded-2xl border border-white/[0.06] bg-slate-900/80 py-16 text-center text-white/15 text-[10px] font-black uppercase tracking-[0.3em]">
      Chưa có lịch sử
    </div>
  );

  const recent = matches.slice(0, 5);

  return (
    <>
      {showAll && <HistoryModal matches={matches} players={players} canEdit={canEdit} onClose={() => setShowAll(false)} matchExpected={matchExpected} />}
      {deleteTarget && (
        <ConfirmDelete
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const id = deleteTarget;
            setDeleteTarget(null);
            setIsDeletingId(id);
            start(async () => {
              await deleteMatchAction(id);
              setIsDeletingId(null);
            });
          }}
        />
      )}

      <div className="w-full rounded-2xl border border-white/[0.06] bg-slate-900/80 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <History className="w-4 h-4 text-white/30" />
            <span className="text-xs font-black text-white/40 uppercase tracking-[0.25em]">Lịch sử gần đây</span>
          </div>
          <button onClick={() => setShowAll(true)}
            className="text-xs font-black text-primary/70 hover:text-primary uppercase tracking-widest transition-colors">
            Tất cả →
          </button>
        </div>

        {/* Rows */}
        {recent.map((m, idx) => {
          const d = new Date(m.date);
          const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
          const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
          const isDouble = m.win_2 || m.lose_2;

          return (
            <div key={m.id}
              className={cn('border-b border-white/[0.04] last:border-0', idx % 2 === 1 && 'bg-white/[0.015]')}>

              {/* ── PC ─────────────────────────────────────────────────── */}
              <div className="hidden lg:flex items-stretch min-h-[72px]">
                <div className="w-28 shrink-0 border-r border-white/[0.05] flex flex-col items-center justify-center gap-0.5 px-3">
                  <span className="text-[17px] font-black text-white/75 tabular-nums leading-none">{time}</span>
                  <span className="text-[11px] font-semibold text-white/30 tabular-nums">{date}</span>
                  <span className="text-[9px] font-black text-primary/40 uppercase tracking-widest mt-0.5">{m.season ?? 'S1'}</span>
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center items-end px-5 gap-0.5">
                  <span className="text-[14px] font-bold text-white/85 truncate max-w-full">{name(m.win_1)}</span>
                  {isDouble && <span className="text-[14px] font-bold text-white/85 truncate max-w-full">{name(m.win_2)}</span>}
                </div>

                <div className="shrink-0 flex flex-col items-center justify-center px-4">
                  <div className="px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary font-black text-[17px] tabular-nums tracking-tight whitespace-nowrap">
                    {m.win_score}–{m.lose_score}
                  </div>
                  {matchExpected?.get(m.id) && (
                    <span className="text-[10px] font-bold text-white/30 mt-1 block tracking-tight">
                      Dự đoán trước trận: {Math.round(matchExpected.get(m.id).winProb * 100)}% - {Math.round(matchExpected.get(m.id).loseProb * 100)}%
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center items-start px-5 gap-0.5">
                  <span className="text-[14px] font-bold text-white/85 truncate max-w-full">{name(m.lose_1)}</span>
                  {isDouble && <span className="text-[14px] font-bold text-white/85 truncate max-w-full">{name(m.lose_2)}</span>}
                </div>

                <div className="shrink-0 flex items-center justify-center w-12">
                  {canEdit && (
                    <button disabled={isDeletingId === m.id} onClick={() => setDeleteTarget(m.id)}
                      className={cn("p-2 text-white/15 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors", isDeletingId === m.id && "opacity-50 pointer-events-none")}>
                      {isDeletingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* ── COMPACT ─────────────────────────────────────────────── */}
              <div className="lg:hidden px-4 py-3" data-mobile-match-row>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[10px] font-bold text-white/25 flex items-center gap-1.5">
                    <span className="text-primary/50 font-black">{m.season ?? 'S1'}</span>
                    <span className="text-white/10">·</span>
                    {date} <span className="text-white/10">·</span> {time}
                  </span>
                  {canEdit && (
                    <button disabled={isDeletingId === m.id} onClick={() => setDeleteTarget(m.id)}
                      className={cn("text-white/15 hover:text-red-400 p-1 rounded-lg transition-colors", isDeletingId === m.id && "opacity-50 pointer-events-none")}>
                      {isDeletingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5 text-right">
                    <CompactRecentPlayerName players={players} id={m.win_1} className="text-[13px] sm:text-sm font-bold text-white/85 leading-snug" />
                    {isDouble && <CompactRecentPlayerName players={players} id={m.win_2} className="text-[13px] sm:text-sm font-bold text-white/85 leading-snug" />}
                  </div>

                  <div className="shrink-0 flex flex-col items-center">
                    <div className="min-w-[68px] text-center px-2.5 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary font-black text-sm tabular-nums whitespace-nowrap">
                      <span data-mobile-score>{m.win_score}–{m.lose_score}</span>
                    </div>
                    {matchExpected?.get(m.id) && (
                      <span className="text-[8px] font-bold text-white/30 mt-1 block tracking-tight whitespace-nowrap">
                        {Math.round(matchExpected.get(m.id).winProb * 100)}% - {Math.round(matchExpected.get(m.id).loseProb * 100)}%
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col gap-0.5 text-left">
                    <CompactRecentPlayerName players={players} id={m.lose_1} className="text-[13px] sm:text-sm font-bold text-white/85 leading-snug" />
                    {isDouble && <CompactRecentPlayerName players={players} id={m.lose_2} className="text-[13px] sm:text-sm font-bold text-white/85 leading-snug" />}
                  </div>
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </>
  );
}
