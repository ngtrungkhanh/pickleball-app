'use client';
import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { addMatchAction } from '@/app/actions';
import { Minus, Plus, Trophy, Ghost, Send, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isGuestId } from '@/lib/guest';

const PENDING_KEY = 'pickleball_pending_match';
const RECENT_KEY = 'pickleball_recent_matches';

type MatchSlots = {
  win1: string;
  win2: string;
  lose1: string;
  lose2: string;
  season: string;
};

function teamKey(a: string, b: string): string {
  return [a, b].filter(Boolean).sort().join('|');
}

function duplicateKey(slots: MatchSlots): string {
  return `${slots.season}::${teamKey(slots.win1, slots.win2)}>${teamKey(slots.lose1, slots.lose2)}`;
}

function isDuplicateLocally(slots: MatchSlots): boolean {
  try {
    const recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    const key = duplicateKey(slots);
    const now = Date.now();
    return recent.some((m: any) => (now - m.timestamp) / 60000 <= 15 && m.key === key);
  } catch {
    return false;
  }
}

function saveRecentLocal(slots: MatchSlots) {
  try {
    const key = duplicateKey(slots);
    const prev: any[] = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify([{ key, timestamp: Date.now() }, ...prev].slice(0, 8))
    );
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

function SyncBadge({
  state,
  onRetry,
}: {
  state: 'idle' | 'syncing' | 'error' | 'ok';
  onRetry?: () => void;
}) {
  if (state === 'idle') return null;
  return (
    <div
      className={cn(
        'fixed top-6 right-6 z-[700] flex items-center gap-3 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] animate-in slide-in-from-top-6 duration-300 backdrop-blur-xl border transition-all',
        state === 'syncing' && 'bg-amber-500/10 border-amber-500/20 text-amber-400',
        state === 'error' && 'bg-red-500/10 border-red-500/20 text-red-400 cursor-pointer hover:bg-red-500/20',
        state === 'ok' && 'bg-primary/10 border-primary/20 text-primary'
      )}
      onClick={state === 'error' ? onRetry : undefined}
    >
      {state === 'syncing' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
      {state === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
      {state === 'ok' && <CheckCircle2 className="w-3.5 h-3.5" />}
      {state === 'syncing' ? 'Dang luu...' : state === 'error' ? 'Luu loi - thu lai' : 'Da luu'}
    </div>
  );
}

function ScoreStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="text-[10px] sm:text-xs font-black text-white/20 uppercase tracking-[0.25em]">{label}</span>
      <div className="flex items-center gap-2 sm:gap-5">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="sm:hidden w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 active:scale-90 transition-all shrink-0"
        >
          <Minus className="w-4 h-4" />
        </button>

        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!isNaN(n) && n >= 0) onChange(n);
            else if (e.target.value === '') onChange(0);
          }}
          onFocus={() => setTimeout(() => ref.current?.select(), 0)}
          className="w-12 sm:w-20 text-center bg-transparent border-0 border-b-4 border-white/5 focus:border-primary/40 outline-none font-black text-white text-2xl sm:text-5xl transition-all py-1 tabular-nums"
          style={{ lineHeight: 1 }}
        />

        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="sm:hidden w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary active:scale-90 transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

const selectCls = [
  'w-full rounded-2xl px-5 py-4',
  'bg-slate-900/50 border border-white/[0.08]',
  'text-sm font-bold text-white/90',
  'focus:outline-none focus:border-primary/40 focus:bg-slate-900',
  'transition-all cursor-pointer hover:border-white/15',
  'appearance-none',
].join(' ');

export function ScoreForm({
  players,
  onAddMatch,
  activeSeason = 'Season 1',
}: {
  players: any[];
  onAddMatch?: (m: any) => void;
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

  const active = players.filter((p) => p.active && !p.deleted_at);
  const reset = () => {
    setWin1('');
    setWin2('');
    setLose1('');
    setLose2('');
    setWs(11);
    setLs(5);
  };

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
    return active.filter((p) => isGuestId(p.id) || !sameSideSelected.includes(p.id));
  };

  useEffect(() => {
    try {
      let id = localStorage.getItem('pickleball_client_id');
      if (!id) {
        id = 'USR-' + Math.random().toString(36).substring(2, 6).toUpperCase();
        localStorage.setItem('pickleball_client_id', id);
      }
      setClientId(id);
      setNickname(localStorage.getItem('pickleball_client_nickname') || '');

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

      setDeviceInfo(`${dev} - ${browser}`);
    } catch {}
  }, []);

  const fullIdentity = `${clientId}${nickname ? ` (${nickname})` : ''} [${deviceInfo || 'Unknown'}]`;

  const handleServerResult = (r: any, fd: FormData) => {
    if (r?.success) {
      clearPending();
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
      setSync('idle');
      router.refresh();
      return;
    }
    if (!r?.error) {
      clearPending();
      setSync('ok');
      setTimeout(() => setSync('idle'), 2500);
      return;
    }
    setSync('error');
    setPendingFd(fd);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.match) return;
      const { match, timestamp } = parsed;
      if ((Date.now() - timestamp) / 60000 >= 60) {
        clearPending();
        return;
      }
      const fd = new FormData();
      Object.entries(match).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v) !== '') fd.append(k, String(v));
      });
      if (!fd.get('created_by')) fd.append('created_by', fullIdentity);
      setSync('syncing');
      start(async () => {
        const r = await addMatchAction(fd);
        handleServerResult(r, fd);
      });
    } catch {}
  }, [activeSeason, fullIdentity, router]);

  const doSync = (fd: FormData) => {
    setSync('syncing');
    savePending(Object.fromEntries(fd.entries()));
    start(async () => {
      const r = await addMatchAction(fd);
      handleServerResult(r, fd);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!win1 || !win2 || !lose1 || !lose2) {
      alert('Vui long chon du 4 nguoi cho tran dau.');
      return;
    }

    const slots: MatchSlots = { win1, win2, lose1, lose2, season: activeSeason };
    let duplicateConfirmed = false;
    if (isDuplicateLocally(slots)) {
      duplicateConfirmed = window.confirm('Tran nay da trung trong vong 15 phut. Ban co chac muon ghi tiep khong?');
      if (!duplicateConfirmed) return;
    }

    onAddMatch?.({
      id: 'TMP-' + Date.now(),
      date: new Date().toISOString(),
      win_1: win1,
      win_2: win2,
      lose_1: lose1,
      lose_2: lose2,
      win_score: ws,
      lose_score: ls,
      season: activeSeason,
      created_by: fullIdentity,
    });
    setUi('saved');
    setTimeout(() => {
      reset();
      setUi('idle');
    }, 1000);

    const fd = new FormData();
    fd.append('win_1', win1);
    fd.append('win_2', win2);
    fd.append('lose_1', lose1);
    fd.append('lose_2', lose2);
    fd.append('win_score', String(ws));
    fd.append('lose_score', String(ls));
    fd.append('season', activeSeason);
    fd.append('created_by', fullIdentity);
    if (duplicateConfirmed) fd.append('duplicate_confirmed', 'true');
    doSync(fd);
  };

  return (
    <>
      <SyncBadge
        state={sync}
        onRetry={() => {
          if (pendingFd) {
            doSync(pendingFd);
            setPendingFd(null);
          }
        }}
      />
      <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-1">
              <Trophy className="w-4 h-4 text-primary opacity-60" />
              <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Doi thang</span>
            </div>
            <div className="space-y-3">
              <select value={win1} onChange={(e) => setSlot('win1', e.target.value)} className={selectCls} required>
                <option value="" disabled hidden>Chon nguoi</option>
                {optionsFor('win1').map((p) => (
                  <option key={p.id} value={p.id}>
                    {isGuestId(p.id) ? 'Khach' : p.name}
                  </option>
                ))}
              </select>
              <select value={win2} onChange={(e) => setSlot('win2', e.target.value)} className={selectCls} required>
                <option value="" disabled hidden>Chon nguoi</option>
                {optionsFor('win2').map((p) => (
                  <option key={p.id} value={p.id}>
                    {isGuestId(p.id) ? 'Khach' : p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <div className="w-full bg-white/[0.02] rounded-2xl sm:rounded-3xl border border-white/[0.06] p-3 sm:p-6 flex items-center justify-center gap-3 sm:gap-7 shadow-xl">
              <ScoreStepper label="Thang" value={ws} onChange={setWs} />
              <div className="pt-5">
                <span className="text-white/10 font-black text-2xl sm:text-4xl select-none leading-none">-</span>
              </div>
              <ScoreStepper label="Thua" value={ls} onChange={setLs} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-center md:justify-end gap-3 mb-1">
              <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Doi thua</span>
              <Ghost className="w-4 h-4 text-red-400 opacity-60" />
            </div>
            <div className="space-y-3">
              <select value={lose1} onChange={(e) => setSlot('lose1', e.target.value)} className={selectCls} required>
                <option value="" disabled hidden>Chon nguoi</option>
                {optionsFor('lose1').map((p) => (
                  <option key={p.id} value={p.id}>
                    {isGuestId(p.id) ? 'Khach' : p.name}
                  </option>
                ))}
              </select>
              <select value={lose2} onChange={(e) => setSlot('lose2', e.target.value)} className={selectCls} required>
                <option value="" disabled hidden>Chon nguoi</option>
                {optionsFor('lose2').map((p) => (
                  <option key={p.id} value={p.id}>
                    {isGuestId(p.id) ? 'Khach' : p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          <button
            type="submit"
            disabled={ui === 'saved'}
            className={cn(
              'w-full max-w-xs py-4 rounded-2xl font-black text-xs uppercase tracking-[0.3em] transition-all duration-300 flex items-center justify-center gap-3',
              ui === 'saved'
                ? 'bg-primary/20 text-primary/60 cursor-default'
                : 'bg-primary hover:bg-primary/90 text-black shadow-lg shadow-primary/20 active:scale-95'
            )}
          >
            {ui === 'saved' ? (
              <>
                <CheckCircle2 className="w-5 h-5" /> Da luu
              </>
            ) : (
              <>
                <Send className="w-5 h-5" /> Ghi ket qua
              </>
            )}
          </button>
        </div>
      </form>
    </>
  );
}
