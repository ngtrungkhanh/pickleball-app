'use client';
import { useState, useTransition, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { addMatchAction, getAppDataPartsAction } from '@/app/actions';
import { Minus, Plus, Trophy, Ghost, Send, RefreshCw, AlertCircle, CheckCircle2, Check, ChevronDown, UserRound, X, Mic, MicOff } from 'lucide-react';
import { parseVoiceInput } from '@/lib/voice-input';
import { cn } from '@/lib/utils';
import { isGuestId } from '@/lib/guest';
import { removeMatchesLocal, replaceAppCacheParts, replaceOptimisticMatchLocal, saveMatchesLocal, type AppCachePart, type StoredPlayer, type StoredPlayerSeasonSetting, type StoredSeason } from '@/lib/db';

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

type ScoreSlot = 'win1' | 'win2' | 'lose1' | 'lose2';

type SelectedSlots = Record<ScoreSlot, string>;

type PlayerRelation = 'current' | 'available' | 'same' | 'other';

type RecentLocalMatch = {
  key: string;
  timestamp: number;
};

type ServerResult = {
  success?: boolean;
  skippedDuplicate?: boolean;
  duplicateConflict?: boolean;
  error?: string;
  debug?: string;
  staleClientData?: boolean;
  missingPlayerIds?: string[];
  dataVersion?: number;
  partVersions?: Record<string, number>;
  match?: Record<string, unknown>;
  duplicateMatch?: Record<string, unknown>;
};

type ServerResultOptions = {
  silent?: boolean;
};

function pickPartVersions(partVersions: Record<string, number> | undefined, parts: AppCachePart[]) {
  if (!partVersions) return undefined;
  return parts.reduce<Record<string, number>>((acc, part) => {
    if (typeof partVersions[part] === 'number') acc[part] = partVersions[part];
    return acc;
  }, {});
}

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

type PendingSave = {
  requestId: string;
  match: Record<string, unknown>;
  timestamp: number;
};

function readPendingSaves(): PendingSave[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { matches?: PendingSave[]; match?: Record<string, unknown>; timestamp?: number };
    if (Array.isArray(parsed?.matches)) {
      return parsed.matches.filter(item => item?.requestId && item.match);
    }
    if (parsed?.match) {
      const requestId = String(parsed.match.client_request_id || parsed.match.temp_id || `LEGACY-${parsed.timestamp || Date.now()}`);
      return [{ requestId, match: parsed.match, timestamp: parsed.timestamp || Date.now() }];
    }
  } catch {}
  return [];
}

function writePendingSaves(matches: PendingSave[]) {
  try {
    if (matches.length === 0) localStorage.removeItem(PENDING_KEY);
    else localStorage.setItem(PENDING_KEY, JSON.stringify({ matches }));
  } catch {}
}

function savePending(data: Record<string, unknown>) {
  const requestId = String(data.client_request_id || data.temp_id || '');
  if (!requestId) return;
  const next = readPendingSaves().filter(item => item.requestId !== requestId);
  next.push({ requestId, match: data, timestamp: Date.now() });
  writePendingSaves(next.slice(-12));
}

function clearPending(requestId?: string) {
  if (!requestId) {
    writePendingSaves([]);
    return;
  }
  writePendingSaves(readPendingSaves().filter(item => item.requestId !== requestId));
}

function runAfterNextPaint(task: () => void) {
  if (typeof window === 'undefined') {
    task();
    return;
  }
  window.requestAnimationFrame(() => {
    window.setTimeout(task, 0);
  });
}

function SyncBadge({ state, message, onRetry }: { state: 'idle' | 'syncing' | 'error' | 'ok'; message?: string; onRetry?: () => void }) {
  if (state === 'idle') return null;
  const label = state === 'syncing' ? 'Đang lưu...' : state === 'error' ? (message || 'Lưu lỗi - thử lại') : 'Đã lưu';
  return (
    <div className={cn(
      'fixed top-6 right-6 z-[700] flex max-w-[min(92vw,560px)] items-start gap-3 rounded-2xl px-5 py-3 text-[11px] font-black shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] animate-in slide-in-from-top-6 duration-300 backdrop-blur-xl border transition-all',
      state === 'syncing' && 'bg-amber-500/10 border-amber-500/20 text-amber-400',
      state === 'error' && 'bg-red-500/10 border-red-500/20 text-red-400 cursor-pointer hover:bg-red-500/20',
      state === 'ok' && 'bg-primary/10 border-primary/20 text-primary',
    )} onClick={state === 'error' ? onRetry : undefined}>
      {state === 'syncing' && <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />}
      {state === 'error' && <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      {state === 'ok' && <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span className={cn('min-w-0 text-left leading-snug', state !== 'error' && 'uppercase tracking-[0.18em]')}>
        {label}
      </span>
    </div>
  );
}

function ScoreStepper({ label, value, onChange, compact = false }: { label: string; value: number; onChange: (v: number) => void; compact?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className={cn("flex flex-col items-center", compact ? "gap-1" : "gap-2")}>
      <span className={cn("font-black text-slate-300/75 uppercase", compact ? "text-[9px] tracking-[0.18em]" : "text-[10px] sm:text-xs tracking-[0.22em]")}>{label}</span>
      <div className={cn("flex items-center", compact ? "gap-1.5" : "gap-2 sm:gap-4")}>
        <button type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className={cn(compact ? "flex h-8 w-8" : "flex sm:hidden w-9 h-9", "rounded-xl bg-white/5 border border-white/10 items-center justify-center text-slate-300/70 active:scale-90 transition-all shrink-0")}>
          <Minus className="w-4 h-4" />
        </button>

        <input
          ref={ref}
          type="text" inputMode="numeric" pattern="[0-9]*"
          value={value}
          onChange={e => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n >= 0) onChange(n); else if (e.target.value === '') onChange(0); }}
          onFocus={() => setTimeout(() => ref.current?.select(), 0)}
          className={cn("text-center bg-transparent border-0 border-b-4 border-white/10 focus:border-primary/50 outline-none font-black text-white transition-all py-1 tabular-nums", compact ? "w-12 text-3xl" : "w-14 sm:w-20 text-4xl sm:text-5xl md:text-6xl")}
          style={{ lineHeight: 1 }}
        />

        <button type="button"
          onClick={() => onChange(value + 1)}
          className={cn(compact ? "flex h-8 w-8" : "flex sm:hidden w-9 h-9", "rounded-xl bg-primary/10 border border-primary/20 items-center justify-center text-primary active:scale-90 transition-all shrink-0")}>
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
  slot,
  selectedSlots,
  onChange,
}: {
  label: string;
  value: string;
  players: ScorePlayer[];
  tone: 'win' | 'lose';
  slot: ScoreSlot;
  selectedSlots: SelectedSlots;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && pickerRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  const teammateSlot: Record<ScoreSlot, ScoreSlot> = {
    win1: 'win2',
    win2: 'win1',
    lose1: 'lose2',
    lose2: 'lose1',
  };
  const otherTeamSlots: Record<ScoreSlot, ScoreSlot[]> = {
    win1: ['lose1', 'lose2'],
    win2: ['lose1', 'lose2'],
    lose1: ['win1', 'win2'],
    lose2: ['win1', 'win2'],
  };

  const playerRelation = (playerId: string): PlayerRelation => {
    if (playerId === value) return 'current';
    if (selectedSlots[teammateSlot[slot]] === playerId) return 'same';
    if (otherTeamSlots[slot].some(otherSlot => selectedSlots[otherSlot] === playerId)) return 'other';
    return 'available';
  };

  const relationPriority: Record<PlayerRelation, number> = {
    current: 0,
    available: 1,
    same: 2,
    other: 3,
  };

  const sortedMembers = members
    .map((player, index) => ({ player, index, relation: playerRelation(player.id) }))
    .sort((a, b) => relationPriority[a.relation] - relationPriority[b.relation] || a.index - b.index);

  const sameTeamClass = tone === 'win'
    ? 'bg-green-500/20 text-green-200 border-green-400/50 hover:bg-green-500/30 shadow-[inset_0_0_0_1px_rgba(74,222,128,0.15)]'
    : 'bg-red-500/20 text-red-200 border-red-400/50 hover:bg-red-500/30 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.15)]';

  const list = (
    <div className="max-h-[70vh] overflow-y-auto p-1.5">
      <div className="space-y-0.5">
        {sortedMembers.map(({ player, relation }) => {
          const active = relation === 'current';
          return (
            <button
              key={player.id}
              type="button"
              onClick={() => choose(player.id)}
              className={cn(
                'flex min-h-11 w-full min-w-0 items-center justify-between gap-2.5 rounded-lg border px-3 py-2 text-left text-sm font-black transition',
                active && accent.active,
                relation === 'available' && `border-transparent text-white ${accent.hover}`,
                relation === 'same' && sameTeamClass,
                relation === 'other' && 'border-amber-200/75 bg-amber-400/24 text-amber-50 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.18)] hover:bg-amber-400/30',
              )}
            >
              <span className="min-w-0 break-words leading-5">{player.name}</span>
              {active && <Check className="h-5 w-5 shrink-0" strokeWidth={3} />}
            </button>
          );
        })}
      </div>

      {guest && (
        <div className="mt-1.5 border-t border-slate-600/60 pt-1.5">
          <button
            type="button"
            onClick={() => choose(guest.id)}
            className={cn(
              'flex min-h-11 w-full min-w-0 items-center justify-between gap-2.5 rounded-lg border px-3 py-2 text-left text-sm font-black transition',
              value === guest.id ? accent.active : 'border-transparent text-slate-200 hover:bg-slate-700/55 hover:text-white',
            )}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-slate-500/30 bg-slate-800">
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
    <div ref={pickerRef} className="relative min-w-0">
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
  onFailMatch,
  activeSeason = 'Season 1',
  compact = false,
}: {
  players: Array<Record<string, unknown>>;
  onAddMatch?: (m: Record<string, unknown>) => void;
  onConfirmMatch?: (tempId: string, match: Record<string, unknown>) => void;
  onRejectMatch?: (tempId: string) => void;
  onFailMatch?: (tempId: string, error?: string) => void;
  activeSeason?: string;
  compact?: boolean;
}) {
  const [, start] = useTransition();
  const router = useRouter();
  const [ui, setUi] = useState<'idle' | 'saved'>('idle');
  const [sync, setSync] = useState<'idle' | 'syncing' | 'error' | 'ok'>('idle');
  const [syncError, setSyncError] = useState('');
  const [pendingFd, setPendingFd] = useState<FormData | null>(null);
  const inFlightRequestIds = useRef(new Set<string>());
  const recoveredPendingOnce = useRef(false);

  const [win1, setWin1] = useState('');
  const [win2, setWin2] = useState('');
  const [lose1, setLose1] = useState('');
  const [lose2, setLose2] = useState('');
  const [ws, setWs] = useState(11);
  const [ls, setLs] = useState(5);
  const [clientId, setClientId] = useState('SYSTEM');
  const [nickname, setNickname] = useState('');
  const [deviceInfo, setDeviceInfo] = useState('');

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const active: ScorePlayer[] = players
    .filter(p => p.active && !p.deleted_at && p.id && p.name && p.hidden !== true)
    .map(p => ({
      id: String(p.id),
      name: String(p.name),
      active: Boolean(p.active),
      deleted_at: p.deleted_at,
    }));
  const reset = () => { setWin1(''); setWin2(''); setLose1(''); setLose2(''); setWs(11); setLs(5); };

  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  type Slot = ScoreSlot;
  const selectedSlots: SelectedSlots = { win1, win2, lose1, lose2 };

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

  const optionsFor = () => active;

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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'vi-VN';
        
        recognition.onstart = () => setIsListening(true);
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        
        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          const parsed = parseVoiceInput(transcript, activeRef.current);
          if (parsed.win1) setWin1(parsed.win1);
          if (parsed.win2) setWin2(parsed.win2);
          if (parsed.lose1) setLose1(parsed.lose1);
          if (parsed.lose2) setLose2(parsed.lose2);
          setWs(parsed.winScore);
          setLs(parsed.loseScore);
          setIsListening(false);
        };
        
        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.error('Speech recognition start failed:', e);
      }
    }
  };

  const fullIdentity = `${clientId}${nickname ? ` (${nickname})` : ''} [${deviceInfo || 'Unknown'}]`;

  const makeRequestId = () => {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `SAVE-${Date.now().toString(36).toUpperCase()}-${random}`;
  };

  const removeOptimisticMatch = useCallback((fd: FormData) => {
    const tempId = String(fd.get('temp_id') || '');
    if (!tempId) return;
    onRejectMatch?.(tempId);
    void removeMatchesLocal([tempId]);
  }, [onRejectMatch]);

  const markOptimisticMatchError = useCallback((fd: FormData, error?: string) => {
    const tempId = String(fd.get('temp_id') || '');
    if (!tempId) return;
    onFailMatch?.(tempId, error);
    void saveMatchesLocal([{
      id: tempId,
      date: new Date().toISOString(),
      win_1: String(fd.get('win_1') || ''),
      win_2: String(fd.get('win_2') || '') || null,
      lose_1: String(fd.get('lose_1') || ''),
      lose_2: String(fd.get('lose_2') || '') || null,
      win_score: Number(fd.get('win_score') || 0),
      lose_score: Number(fd.get('lose_score') || 0),
      season: String(fd.get('season') || activeSeason),
      created_by: String(fd.get('created_by') || 'SYSTEM'),
      client_request_id: String(fd.get('client_request_id') || ''),
      pending: true,
      sync_status: 'error',
      sync_error: error || 'Lưu server thất bại',
    }]);
  }, [activeSeason, onFailMatch]);

  const refreshStaleLocalData = useCallback(async () => {
    const parts: AppCachePart[] = ['players', 'config', 'seasons', 'playerSeasonSettings'];
    const appData = await getAppDataPartsAction(parts);
    if (!appData) throw new Error('Không tải lại được dữ liệu server');
    await replaceAppCacheParts({
      players: appData.players as StoredPlayer[] | undefined,
      seasons: appData.seasons as StoredSeason[] | undefined,
      config: appData.config,
      playerSeasonSettings: appData.playerSeasonSettings as StoredPlayerSeasonSetting[] | undefined,
    }, {
      dataVersion: appData.dataVersion,
      partVersions: pickPartVersions(appData.partVersions, parts),
      manifestCheckedAt: Date.now(),
    });
    router.refresh();
  }, [router]);

  const handleServerResult = async (r: ServerResult | undefined, fd: FormData, options: ServerResultOptions = {}) => {
    const silent = options.silent === true;
    const tempId = String(fd.get('temp_id') || '');
    const requestId = String(fd.get('client_request_id') || tempId);
    if (r?.success) {
      clearPending(requestId);
      if (r.match) {
        onConfirmMatch?.(tempId, r.match);
        await replaceOptimisticMatchLocal(tempId, r.match, r.dataVersion, r.partVersions);
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
      if (!silent) {
        setSyncError('');
        setSync('ok');
        setTimeout(() => setSync('idle'), 2500);
      }
      return;
    }
    if (r?.duplicateConflict) {
      removeOptimisticMatch(fd);
      if (silent) {
        clearPending(requestId);
        setSync('idle');
        return;
      }
      setSync('idle');
      setSyncError('');
      const duplicateDate = r.duplicateMatch?.date ? new Date(String(r.duplicateMatch.date)) : null;
      const duplicateTime = duplicateDate && !Number.isNaN(duplicateDate.getTime())
        ? duplicateDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : 'gần đây';
      const confirmed = window.confirm(`Trận này đã được máy khác ghi lúc ${duplicateTime}. Có muốn ghi thêm trận trùng không?`);
      if (confirmed) {
        fd.set('duplicate_confirmed', 'true');
        setSync('syncing');
        savePending(Object.fromEntries(fd.entries()));
        inFlightRequestIds.current.add(requestId);
        start(async () => {
          try {
            const retry = await addMatchAction(fd);
            await handleServerResult(retry, fd);
          } finally {
            inFlightRequestIds.current.delete(requestId);
          }
        });
      } else {
        clearPending(requestId);
      }
      return;
    }
    if (r?.skippedDuplicate) {
      clearPending(requestId);
      removeOptimisticMatch(fd);
      if (!silent) {
        setSync('idle');
        router.refresh();
      }
      return;
    }
    if (!r?.error) {
      clearPending(requestId);
      removeOptimisticMatch(fd);
      if (!silent) {
        setSyncError('');
        setSync('ok');
        setTimeout(() => setSync('idle'), 2500);
      }
      return;
    }
    markOptimisticMatchError(fd, r.error || r.debug);
    if (r.staleClientData) {
      try {
        await refreshStaleLocalData();
      } catch (error) {
        console.error('Stale local data refresh failed:', error);
      }
    }
    if (silent) {
      setSync('idle');
      return;
    }
    setSyncError(r.error || r.debug || 'Lưu lỗi - thử lại');
    setSync('error');
    setPendingFd(fd);
  };

  useEffect(() => {
    if (recoveredPendingOnce.current) return;
    recoveredPendingOnce.current = true;
    try {
      const pending = readPendingSaves();
      pending.forEach(({ match, timestamp, requestId }) => {
        if (!timestamp || (Date.now() - timestamp) / 60000 >= 60) {
          clearPending(requestId);
          return;
        }
        if (inFlightRequestIds.current.has(requestId)) return;
        const fd = new FormData();
        Object.entries(match).forEach(([k, v]) => { if (v) fd.append(k, String(v)); });
        if (!fd.get('created_by')) fd.append('created_by', fullIdentity);
        if (!fd.get('client_request_id')) fd.append('client_request_id', requestId);
        inFlightRequestIds.current.add(requestId);
        start(async () => {
          try {
            const r = await addMatchAction(fd);
            await handleServerResult(r, fd, { silent: true });
          } catch (error) {
            console.error('Pending match retry failed:', error);
            setSyncError(error instanceof Error ? error.message : String(error));
            markOptimisticMatchError(fd, error instanceof Error ? error.message : String(error));
            setSync('idle');
          } finally {
            inFlightRequestIds.current.delete(requestId);
          }
        });
      });
    } catch {}
    // Pending recovery is intentionally one-shot; in-flight guards handle retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullIdentity]);

  const doSync = (fd: FormData) => {
    const requestId = String(fd.get('client_request_id') || fd.get('temp_id') || '');
    if (requestId && inFlightRequestIds.current.has(requestId)) return;
    if (requestId) inFlightRequestIds.current.add(requestId);
    setSyncError('');
    setSync('syncing');
    savePending(Object.fromEntries(fd.entries()));
    start(async () => {
      try {
        const r = await addMatchAction(fd);
        await handleServerResult(r, fd);
      } catch (error) {
        console.error('Match sync failed:', error);
        setSyncError(error instanceof Error ? error.message : String(error));
        markOptimisticMatchError(fd, error instanceof Error ? error.message : String(error));
        setSync('error');
        setPendingFd(fd);
      } finally {
        if (requestId) inFlightRequestIds.current.delete(requestId);
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!win1 || !win2 || !lose1 || !lose2) return alert('Vui lòng chọn đủ 4 người.');

    const slots: MatchSlots = { win1, win2, lose1, lose2, season: activeSeason };
    let duplicateConfirmed = false;
    if (isDuplicateLocally(slots)) {
      duplicateConfirmed = window.confirm('Trận này đã trùng trong vòng 15 phút. Bạn có chắc muốn ghi tiếp không?');
      if (!duplicateConfirmed) return;
    }

    const requestId = makeRequestId();
    const tempId = 'TMP-' + requestId;
    const optimisticMatch = { id: tempId, date: new Date().toISOString(), win_1: win1, win_2: win2 || null, lose_1: lose1, lose_2: lose2 || null, win_score: ws, lose_score: ls, season: activeSeason, created_by: fullIdentity, client_request_id: requestId, pending: true, sync_status: 'syncing' };
    setUi('saved');
    setTimeout(() => { reset(); setUi('idle'); }, 1000);

    runAfterNextPaint(() => {
      onAddMatch?.(optimisticMatch);
      void saveMatchesLocal([optimisticMatch]);

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
      fd.append('client_request_id', requestId);
      if (duplicateConfirmed) fd.append('duplicate_confirmed', 'true');
      doSync(fd);
    });
  };

  return (
    <>
      <SyncBadge state={sync} message={syncError} onRetry={() => { if (pendingFd) { doSync(pendingFd); setPendingFd(null); } }} />
      <form onSubmit={handleSubmit} className={cn("space-y-4", compact ? "p-3" : "p-3 sm:p-4", ui === 'saved' && "pointer-events-none opacity-80")}>
        <div className={cn("grid grid-cols-1 items-stretch", compact ? "gap-2.5" : "md:grid-cols-[minmax(0,0.78fr)_18rem_minmax(0,0.78fr)] gap-3 md:gap-4")}>

          <div className={cn("min-w-0 rounded-2xl border border-green-500/35 bg-green-500/5 space-y-2", compact ? "p-2.5" : "p-3")}>
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-primary opacity-60" />
              <span className="text-[10px] font-black text-green-300 uppercase tracking-[0.2em]">Đội thắng</span>
            </div>
            <div className="space-y-2">
              <PlayerPicker label="Người thắng 1" tone="win" slot="win1" selectedSlots={selectedSlots} value={win1} players={optionsFor()} onChange={value => setSlot('win1', value)} />
              <PlayerPicker label="Người thắng 2" tone="win" slot="win2" selectedSlots={selectedSlots} value={win2} players={optionsFor()} onChange={value => setSlot('win2', value)} />
            </div>
          </div>

          <div className="flex min-w-0 flex-col items-center">
            <div className={cn("flex w-full items-center justify-center rounded-2xl border border-slate-600/60 bg-black/45 p-3 shadow-inner", compact ? "min-h-[96px] gap-2" : "min-h-[122px] gap-3 md:min-h-full sm:gap-4")}>
              <ScoreStepper label="Thắng" value={ws} onChange={setWs} compact={compact} />
              <div className="pt-4">
                <span className={cn("text-slate-400/80 font-black select-none leading-none", compact ? "text-2xl" : "text-3xl sm:text-4xl")}>-</span>
              </div>
              <ScoreStepper label="Thua" value={ls} onChange={setLs} compact={compact} />
            </div>
          </div>

          <div className={cn("min-w-0 rounded-2xl border border-red-500/35 bg-red-500/5 space-y-2", compact ? "p-2.5" : "p-3")}>
            <div className="flex items-center justify-center md:justify-end gap-2">
              <span className="text-[10px] font-black text-red-300 uppercase tracking-[0.2em]">Đội thua</span>
              <Ghost className="w-4 h-4 text-red-400 opacity-60" />
            </div>
            <div className="space-y-2">
              <PlayerPicker label="Người thua 1" tone="lose" slot="lose1" selectedSlots={selectedSlots} value={lose1} players={optionsFor()} onChange={value => setSlot('lose1', value)} />
              <PlayerPicker label="Người thua 2" tone="lose" slot="lose2" selectedSlots={selectedSlots} value={lose2} players={optionsFor()} onChange={value => setSlot('lose2', value)} />
            </div>
          </div>

        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="flex w-full items-center gap-3">
            <motion.button
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={toggleListening}
              className={cn(
                'min-h-12 px-4 sm:px-5 rounded-2xl transition-colors duration-150 flex items-center justify-center shrink-0 border',
                isListening
                  ? 'bg-red-500/20 text-red-400 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
              )}
              title="Nhập điểm bằng giọng nói"
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </motion.button>
            <motion.button
              whileTap={ui === 'saved' ? undefined : { scale: 0.95 }}
              type="submit"
              disabled={ui === 'saved'}
            className={cn(
              'w-full min-h-12 py-3 rounded-2xl font-black uppercase transition-colors duration-150 flex items-center justify-center gap-3',
              compact ? 'text-[11px] tracking-[0.18em]' : 'text-xs sm:text-sm tracking-[0.24em]',
              ui === 'saved'
                ? 'bg-primary/20 text-primary/60 cursor-default'
                : 'bg-primary hover:bg-primary/90 text-black shadow-lg shadow-primary/20'
            )}
          >
            {ui === 'saved' ? <><CheckCircle2 className="w-5 h-5" /> Đã ghi tạm</> : <><Send className="w-5 h-5" /> Ghi kết quả</>}
            </motion.button>
          </div>
        </div>
      </form>
    </>
  );
}
