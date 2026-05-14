'use client';
import { useState, useTransition, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { addMatchAction } from '@/app/actions';
import { Minus, Plus, Trophy, Ghost, Send, RefreshCw, AlertCircle, CheckCircle2, Check, ChevronDown, UserRound, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isGuestId } from '@/lib/guest';
import { removeMatchesLocal, replaceOptimisticMatchLocal, saveMatchesLocal } from '@/lib/db';

const PENDING_KEY = 'pickleball_pending_match';
const RECENT_KEY = 'pickleball_recent_matches';

type MatchSlots = {
  win1: string;
  win2: string;
  lose1: string;
  lose2: string;
  season: string;
};

type ScorePlayer = {
  id: string;
  name: string;
  active?: boolean;
  deleted_at?: unknown;
};

type RecentLocalMatch = {
  key: string;
  timestamp: number;
};

type ServerResult = {
  success?: boolean;
  skippedDuplicate?: boolean;
  error?: string;
  dataVersion?: number;
  match?: Record<string, unknown>;
};

function teamKey(a: string, b: string): string {
  return [a, b].filter(Boolean).sort().join('|');
}

function localDuplicateKey(slots: MatchSlots): string {
  return `${slots.season}::${teamKey(slots.win1, slots.win2)}>${teamKey(slots.lose1, slots.lose2)}`;
}

function isDuplicateLocally(slots: MatchSlots): boolean {
  try {
    const recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as RecentLocalMatch[];
    const key = localDuplicateKey(slots);
    const now = Date.now();
    return recent.some((m) => (now - m.timestamp) / 60000 <= 15 && m.key === key);
  } catch {
    return false;
  }
}

function saveRecentLocal(slots: MatchSlots) {
  try {
    const key = localDuplicateKey(slots);
    const prev = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as RecentLocalMatch[];
    localStorage.setItem(RECENT_KEY, JSON.stringify([{ key, timestamp: Date.now() }, ...prev].slice(0, 8)));
  } catch {}
}

function savePending(data: object) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ match: data, timestamp: Date.now() }));
  } catch {}
}

function clearPending() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {}
}

function SyncBadge({ state, onRetry }: { state: 'idle' | 'syncing' | 'error' | 'ok'; onRetry?: () => void }) {
  if (state === 'idle') return null;
  return (
    <div className={cn(
      'fixed top-6 right-6 z-[700] flex items-center gap-3 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] animate-in slide-in-from-top-6 duration-300 backdrop-blur-xl border transition-all',
      state === 'syncing' && 'bg-amber-500/10 border-amber-500/20 text-amber-400',
      state === 'error' && 'bg-red-500/10 border-red-500/20 text-red-400 cursor-pointer hover:bg-red-500/20',
      state === 'ok' && 'bg-primary/10 border-primary/20 text-primary',
    )} onClick={state === 'error' ? onRetry : undefined}>
      {state === 'syncing' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
      {state === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
      {state === 'ok' && <CheckCircle2 className="w-3.5 h-3.5" />}
      {state === 'syncing' ? 'Đang lưu...' : state === 'error' ? 'Lưu lỗi - thử lại' : 'Đã lưu'}
    </div>
  );
}

function ScoreStepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[10px] sm:text-xs font-black text-slate-300/75 uppercase tracking-[0.22em]">{label}</span>
      <div className="flex items-center gap-2 sm:gap-4">
        <button type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="sm:hidden w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-300/70 active:scale-90 transition-all shrink-0">
          <Minus className="w-4 h-4" />
        </button>

        <input
          ref={ref}
          type="text" inputMode="numeric" pattern="[0-9]*"
          value={value}
          onChange={e => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n >= 0) onChange(n); else if (e.target.value === '') onChange(0); }}
          onFocus={() => setTimeout(() => ref.current?.select(), 0)}
          className="w-14 sm:w-20 text-center bg-transparent border-0 border-b-4 border-white/10 focus:border-primary/50 outline-none font-black text-white text-4xl sm:text-5xl md:text-6xl transition-all py-1 tabular-nums"
          style={{ lineHeight: 1 }}
        />

        <button type="button"
          onClick={() => onChange(value + 1)}
          className="sm:hidden w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary active:scale-90 transition-all shrink-0">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function PlayerPicker({
  label,
  value,
  players,
  tone,
  onChange,
}: {
  label: string;
  value: string;
  players: ScorePlayer[];
  tone: 'win' | 'lose';
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = players.find(p => p.id === value);
  const guest = players.find(p => isGuestId(p.id));
  const members = players.filter(p => !isGuestId(p.id));
  const accent = tone === 'win'
    ? {
        label: 'text-green-300',
        border: 'border-green-500/35',
        bg: 'bg-green-500/5',
        active: 'bg-green-500/15 text-green-100 border-green-400/40',
        hover: 'hover:bg-green-500/10 hover:text-green-100',
        ring: 'focus:ring-green-400/25',
      }
    : {
        label: 'text-red-300',
        border: 'border-red-500/35',
        bg: 'bg-red-500/5',
        active: 'bg-red-500/15 text-red-100 border-red-400/40',
        hover: 'hover:bg-red-500/10 hover:text-red-100',
        ring: 'focus:ring-red-400/25',
      };

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  const list = (
    <div className="max-h-[70vh] overflow-y-auto p-2">
      <div className="space-y-1">
        {members.map(player => {
          const active = player.id === value;
          return (
            <button
              key={player.id}
              type="button"
              onClick={() => choose(player.id)}
              className={cn(
                'flex min-h-14 w-full min-w-0 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-base font-black transition',
                active ? accent.active : `border-transparent text-white ${accent.hover}`,
              )}
            >
              <span className="min-w-0 break-words leading-5">{player.name}</span>
              {active && <Check className="h-5 w-5 shrink-0" strokeWidth={3} />}
            </button>
          );
        })}
      </div>

      {guest && (
        <div className="mt-2 border-t border-slate-600/60 pt-2">
          <button
            type="button"
            onClick={() => choose(guest.id)}
            className={cn(
              'flex min-h-14 w-full min-w-0 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-base font-black transition',
              value === guest.id ? accent.active : 'border-transparent text-slate-200 hover:bg-slate-700/55 hover:text-white',
            )}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-500/30 bg-slate-800">
                <UserRound className="h-4 w-4 text-slate-300" />
              </span>
              <span className="min-w-0 break-words leading-5">Khách</span>
            </span>
            {value === guest.id && <Check className="h-5 w-5 shrink-0" strokeWidth={3} />}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition focus:outline-none focus:ring-2',
          accent.border,
          accent.bg,
          accent.ring,
        )}
        aria-label={label}
      >
        <span className={cn('min-w-0 truncate text-xs sm:text-sm font-bold leading-5', selected ? 'text-white' : 'text-slate-400')}>
          {selected ? (isGuestId(selected.id) ? 'Khách' : selected.name) : 'Chọn người'}
        </span>
        <ChevronDown className="h-5 w-5 shrink-0 text-slate-300" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[610] bg-black/55 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-[620] overflow-hidden rounded-t-[2rem] border border-slate-500/25 bg-[#142034] shadow-[0_-24px_80px_rgba(0,0,0,0.45)] md:hidden">
            <div className="flex items-center justify-between border-b border-slate-500/25 px-5 py-4">
              <div>
                <div className={cn('text-sm font-black uppercase tracking-[0.22em]', accent.label)}>{label}</div>
                <div className="mt-1 text-xs font-bold text-slate-300/75">Chọn thành viên</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.07] text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {list}
          </div>

          <div className="fixed inset-0 z-30 hidden md:block" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+0.5rem)] z-40 hidden w-full min-w-72 overflow-hidden rounded-2xl border border-slate-500/25 bg-[#142034] shadow-[0_24px_80px_rgba(0,0,0,0.45)] md:block">
            {list}
          </div>
        </>
      )}
    </div>
  );
}

export function ScoreForm({
  players,
  onAddMatch,
  onConfirmMatch,
  onRejectMatch,
  activeSeason = 'Season 1',
}: {
  players: Array<Record<string, unknown>>;
  onAddMatch?: (m: Record<string, unknown>) => void;
  onConfirmMatch?: (tempId: string, match: Record<string, unknown>) => void;
  onRejectMatch?: (tempId: string) => void;
  activeSeason?: string;
}) {
  const [, start] = useTransition();
  const router = useRouter();
  const [ui, setUi] = useState<'idle' | 'saved'>('idle');
  const [sync, setSync] = useState<'idle' | 'syncing' | 'error' | 'ok'>('idle');
  const [pendingFd, setPendingFd] = useState<FormData | null>(null);

  const [win1, setWin1] = useState('');
  const [win2, setWin2] = useState('');
  const [lose1, setLose1] = useState('');
  const [lose2, setLose2] = useState('');
  const [ws, setWs] = useState(11);
  const [ls, setLs] = useState(5);
  const [clientId, setClientId] = useState('SYSTEM');
  const [nickname, setNickname] = useState('');
  const [deviceInfo, setDeviceInfo] = useState('');

  const active: ScorePlayer[] = players
    .filter(p => p.active && !p.deleted_at && p.id && p.name)
    .map(p => ({
      id: String(p.id),
      name: String(p.name),
      active: Boolean(p.active),
      deleted_at: p.deleted_at,
    }));
  const reset = () => { setWin1(''); setWin2(''); setLose1(''); setLose2(''); setWs(11); setLs(5); };

  type Slot = 'win1' | 'win2' | 'lose1' | 'lose2';
  const setSlot = (slot: Slot, value: string) => {
    if (value && !isGuestId(value)) {
      if (slot !== 'win1' && win1 === value) setWin1('');
      if (slot !== 'win2' && win2 === value) setWin2('');
      if (slot !== 'lose1' && lose1 === value) setLose1('');
      if (slot !== 'lose2' && lose2 === value) setLose2('');
    }

    if (slot === 'win1') setWin1(value);
    if (slot === 'win2') setWin2(value);
    if (slot === 'lose1') setLose1(value);
    if (slot === 'lose2') setLose2(value);
  };

  const optionsFor = (slot: Slot) => {
    const sameSideSelected = slot.startsWith('win')
      ? [slot === 'win1' ? win2 : win1]
      : [slot === 'lose1' ? lose2 : lose1];

    return active.filter(p => isGuestId(p.id) || !sameSideSelected.includes(p.id));
  };

  useEffect(() => {
    try {
      let id = localStorage.getItem('pickleball_client_id');
      if (!id) {
        id = 'USR-' + Math.random().toString(36).substring(2, 6).toUpperCase();
        localStorage.setItem('pickleball_client_id', id);
      }
      const nick = localStorage.getItem('pickleball_client_nickname') || '';

      const ua = navigator.userAgent;
      let dev = 'Device';
      if (/android/i.test(ua)) dev = 'Android';
      else if (/iPad|iPhone|iPod/.test(ua)) dev = 'iPhone/iPad';
      else if (/Macintosh/i.test(ua)) dev = 'MacBook';
      else if (/Windows/i.test(ua)) dev = 'Windows PC';
      else if (/Linux/i.test(ua)) dev = 'Linux PC';

      let browser = 'Browser';
      if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
      else if (ua.indexOf('Safari') > -1) browser = 'Safari';
      else if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
      else if (ua.indexOf('Edge') > -1) browser = 'Edge';

      queueMicrotask(() => {
        setClientId(id);
        setNickname(nick);
        setDeviceInfo(`${dev} - ${browser}`);
      });
    } catch {}
  }, []);

  const fullIdentity = `${clientId}${nickname ? ` (${nickname})` : ''} [${deviceInfo || 'Unknown'}]`;

  const removeOptimisticMatch = useCallback((fd: FormData) => {
    const tempId = String(fd.get('temp_id') || '');
    if (!tempId) return;
    onRejectMatch?.(tempId);
    void removeMatchesLocal([tempId]);
  }, [onRejectMatch]);

  const handleServerResult = useCallback(async (r: ServerResult | undefined, fd: FormData) => {
    const tempId = String(fd.get('temp_id') || '');
    if (r?.success) {
      clearPending();
      if (r.match) {
        onConfirmMatch?.(tempId, r.match);
        await replaceOptimisticMatchLocal(tempId, r.match, r.dataVersion);
      } else if (tempId) {
        onRejectMatch?.(tempId);
        await removeMatchesLocal([tempId]);
      }
      saveRecentLocal({
        win1: String(fd.get('win_1') || ''),
        win2: String(fd.get('win_2') || ''),
        lose1: String(fd.get('lose_1') || ''),
        lose2: String(fd.get('lose_2') || ''),
        season: String(fd.get('season') || activeSeason),
      });
      setSync('ok');
      setTimeout(() => setSync('idle'), 2500);
      return;
    }
    if (r?.skippedDuplicate) {
      clearPending();
      removeOptimisticMatch(fd);
      setSync('idle');
      router.refresh();
      return;
    }
    if (!r?.error) {
      clearPending();
      removeOptimisticMatch(fd);
      setSync('ok');
      setTimeout(() => setSync('idle'), 2500);
      return;
    }
    removeOptimisticMatch(fd);
    setSync('error');
    setPendingFd(fd);
  }, [activeSeason, onConfirmMatch, onRejectMatch, removeOptimisticMatch, router]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { match?: Record<string, unknown>; timestamp?: number };
      if (!parsed || !parsed.match) return;
      const { match, timestamp } = parsed;
      if (timestamp && (Date.now() - timestamp) / 60000 < 60) {
        const fd = new FormData();
        Object.entries(match).forEach(([k, v]) => { if (v) fd.append(k, String(v)); });
        if (!fd.get('created_by')) fd.append('created_by', fullIdentity);
        queueMicrotask(() => setSync('syncing'));
        start(async () => {
          const r = await addMatchAction(fd);
          await handleServerResult(r, fd);
        });
      } else clearPending();
    } catch {}
  }, [fullIdentity, handleServerResult]);

  const doSync = (fd: FormData) => {
    setSync('syncing');
    savePending(Object.fromEntries(fd.entries()));
    start(async () => {
      const r = await addMatchAction(fd);
      await handleServerResult(r, fd);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!win1 || !win2 || !lose1 || !lose2) return alert('Vui lòng chọn đủ 4 người.');

    const slots: MatchSlots = { win1, win2, lose1, lose2, season: activeSeason };
    let duplicateConfirmed = false;
    if (isDuplicateLocally(slots)) {
      duplicateConfirmed = window.confirm('Trận này đã trùng trong vòng 15 phút. Bạn có chắc muốn ghi tiếp không?');
      if (!duplicateConfirmed) return;
    }

    const tempId = 'TMP-' + Date.now();
    const optimisticMatch = { id: tempId, date: new Date().toISOString(), win_1: win1, win_2: win2 || null, lose_1: lose1, lose_2: lose2 || null, win_score: ws, lose_score: ls, season: activeSeason, created_by: fullIdentity, pending: true };
    onAddMatch?.(optimisticMatch);
    void saveMatchesLocal([optimisticMatch]);
    setUi('saved');
    setTimeout(() => { reset(); setUi('idle'); }, 1000);

    const fd = new FormData();
    fd.append('win_1', win1);
    fd.append('win_2', win2);
    fd.append('lose_1', lose1);
    fd.append('lose_2', lose2);
    fd.append('win_score', String(ws));
    fd.append('lose_score', String(ls));
    fd.append('season', activeSeason);
    fd.append('created_by', fullIdentity);
    fd.append('temp_id', tempId);
    if (duplicateConfirmed) fd.append('duplicate_confirmed', 'true');
    doSync(fd);
  };

  return (
    <>
      <SyncBadge state={sync} onRetry={() => { if (pendingFd) { doSync(pendingFd); setPendingFd(null); } }} />
      <form onSubmit={handleSubmit} className="p-3 sm:p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,0.78fr)_18rem_minmax(0,0.78fr)] gap-3 md:gap-4 items-stretch">

          <div className="min-w-0 rounded-2xl border border-green-500/35 bg-green-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-primary opacity-60" />
              <span className="text-[10px] font-black text-green-300 uppercase tracking-[0.2em]">Đội thắng</span>
            </div>
            <div className="space-y-2">
              <PlayerPicker label="Người thắng 1" tone="win" value={win1} players={optionsFor('win1')} onChange={value => setSlot('win1', value)} />
              <PlayerPicker label="Người thắng 2" tone="win" value={win2} players={optionsFor('win2')} onChange={value => setSlot('win2', value)} />
            </div>
          </div>

          <div className="flex min-w-0 flex-col items-center">
            <div className="flex min-h-[122px] w-full items-center justify-center gap-3 rounded-2xl border border-slate-600/60 bg-black/45 p-3 shadow-inner md:min-h-full sm:gap-4">
              <ScoreStepper label="Thắng" value={ws} onChange={setWs} />
              <div className="pt-4">
                <span className="text-slate-400/80 font-black text-3xl sm:text-4xl select-none leading-none">-</span>
              </div>
              <ScoreStepper label="Thua" value={ls} onChange={setLs} />
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-red-500/35 bg-red-500/5 p-3 space-y-2">
            <div className="flex items-center justify-center md:justify-end gap-2">
              <span className="text-[10px] font-black text-red-300 uppercase tracking-[0.2em]">Đội thua</span>
              <Ghost className="w-4 h-4 text-red-400 opacity-60" />
            </div>
            <div className="space-y-2">
              <PlayerPicker label="Người thua 1" tone="lose" value={lose1} players={optionsFor('lose1')} onChange={value => setSlot('lose1', value)} />
              <PlayerPicker label="Người thua 2" tone="lose" value={lose2} players={optionsFor('lose2')} onChange={value => setSlot('lose2', value)} />
            </div>
          </div>

        </div>

        <div className="flex flex-col items-center gap-4">
          <button
            type="submit"
            disabled={ui === 'saved'}
            className={cn(
              'w-full min-h-12 py-3 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-[0.24em] transition-all duration-300 flex items-center justify-center gap-3',
              ui === 'saved'
                ? 'bg-primary/20 text-primary/60 cursor-default'
                : 'bg-primary hover:bg-primary/90 text-black shadow-lg shadow-primary/20 active:scale-95'
            )}
          >
            {ui === 'saved' ? <><CheckCircle2 className="w-5 h-5" /> Đã lưu</> : <><Send className="w-5 h-5" /> Ghi kết quả</>}
          </button>
        </div>
      </form>
    </>
  );
}
