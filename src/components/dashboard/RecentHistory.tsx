'use client';
import { useState, useTransition, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { History, X, Trash2, Calendar, AlertTriangle, Loader2 } from 'lucide-react';
import { isGuestId } from '@/lib/guest';
import { useSwipeable } from 'react-swipeable';
import { motion } from 'framer-motion';

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
      {playerName(players, id, 'tiny')}
    </span>
  );
}

function PortalLayer({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
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
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-6">
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

function HistoryModal({ matches, players, onClose, canEdit, matchExpected, onDeleteMatch }: { matches: any[]; players: any[]; onClose: () => void; canEdit: boolean; matchExpected?: any; onDeleteMatch?: (matchId: string) => Promise<void> | void }) {
  const [isClosing, setIsClosing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [member1, setMember1] = useState('');
  const [member2, setMember2] = useState('');
  const [relation, setRelation] = useState<'-' | 'partner' | 'opponent'>('-');
  const [result, setResult] = useState<'-' | 'win' | 'loss'>('-');
  const [, start] = useTransition();

  // Drag states and refs
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const currentDragOffsetRef = useRef(0);
  const [isDraggedClose, setIsDraggedClose] = useState(false);

  // Refs to hold stable event listener references to prevent memory leaks during re-renders
  const mouseMoveListenerRef = useRef<(e: MouseEvent) => void>(undefined);
  const mouseUpListenerRef = useRef<() => void>(undefined);

  // Assign fresh handlers to refs after render has completed to comply with react-hooks/refs rule
  useEffect(() => {
    mouseMoveListenerRef.current = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const currentY = e.clientY;
      const deltaY = currentY - dragStartYRef.current;
      const offset = Math.max(0, deltaY);
      currentDragOffsetRef.current = offset;

      const progress = Math.max(0, 1 - offset / 350);
      const blurVal = 12 * progress;

      if (panelRef.current) {
        panelRef.current.style.transform = `translate3d(0, ${offset}px, 0)`;
      }
      if (backdropRef.current) {
        backdropRef.current.style.opacity = progress.toString();
        backdropRef.current.style.setProperty('backdrop-filter', `blur(${blurVal}px)`);
        backdropRef.current.style.setProperty('-webkit-backdrop-filter', `blur(${blurVal}px)`);
      }
    };

    mouseUpListenerRef.current = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      
      if (mouseMoveListenerRef.current) {
        window.removeEventListener('mousemove', mouseMoveListenerRef.current);
      }
      if (mouseUpListenerRef.current) {
        window.removeEventListener('mouseup', mouseUpListenerRef.current);
      }

      const threshold = 80;
      const offset = currentDragOffsetRef.current;

      if (offset > threshold) {
        setIsClosing(true);
        setIsDraggedClose(true);
        if (panelRef.current) {
          panelRef.current.style.transition = 'transform 240ms cubic-bezier(0.32, 0.94, 0.6, 1)';
          panelRef.current.style.transform = 'translate3d(0, 100vh, 0)';
        }
        if (backdropRef.current) {
          backdropRef.current.style.transition = 'opacity 240ms cubic-bezier(0.32, 0.94, 0.6, 1), backdrop-filter 240ms cubic-bezier(0.32, 0.94, 0.6, 1), -webkit-backdrop-filter 240ms cubic-bezier(0.32, 0.94, 0.6, 1)';
          backdropRef.current.style.opacity = '0';
          backdropRef.current.style.setProperty('backdrop-filter', 'blur(0px)');
          backdropRef.current.style.setProperty('-webkit-backdrop-filter', 'blur(0px)');
        }
        window.setTimeout(() => {
          onClose();
        }, 240);
      } else {
        if (panelRef.current) {
          panelRef.current.style.transition = 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)';
          panelRef.current.style.transform = 'translate3d(0, 0, 0)';
        }
        if (backdropRef.current) {
          backdropRef.current.style.transition = 'opacity 300ms cubic-bezier(0.16, 1, 0.3, 1), backdrop-filter 300ms cubic-bezier(0.16, 1, 0.3, 1), -webkit-backdrop-filter 300ms cubic-bezier(0.16, 1, 0.3, 1)';
          backdropRef.current.style.opacity = '1';
          backdropRef.current.style.setProperty('backdrop-filter', 'blur(12px)');
          backdropRef.current.style.setProperty('-webkit-backdrop-filter', 'blur(12px)');
        }
      }
    };
  });

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('select') || target.closest('option') || target.closest('input')) {
      return;
    }

    isDraggingRef.current = true;
    dragStartYRef.current = e.clientY;
    currentDragOffsetRef.current = 0;

    if (panelRef.current) {
      panelRef.current.style.transition = 'none';
      panelRef.current.style.animation = 'none';
    }
    if (backdropRef.current) {
      backdropRef.current.style.transition = 'none';
    }

    if (mouseMoveListenerRef.current && mouseUpListenerRef.current) {
      window.addEventListener('mousemove', mouseMoveListenerRef.current);
      window.addEventListener('mouseup', mouseUpListenerRef.current);
    }
  };

  // Touch drag handlers (Mobile)
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (window.innerWidth >= 640) return;

    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('select') || target.closest('option') || target.closest('input')) {
      return;
    }

    isDraggingRef.current = true;
    dragStartYRef.current = e.touches[0].clientY;
    currentDragOffsetRef.current = 0;

    if (panelRef.current) {
      panelRef.current.style.transition = 'none';
      panelRef.current.style.animation = 'none';
    }
    if (backdropRef.current) {
      backdropRef.current.style.transition = 'none';
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - dragStartYRef.current;

    const offset = Math.max(0, deltaY);
    currentDragOffsetRef.current = offset;

    const progress = Math.max(0, 1 - offset / 350);
    const blurVal = 12 * progress;

    if (panelRef.current) {
      panelRef.current.style.transform = `translate3d(0, ${offset}px, 0)`;
    }
    if (backdropRef.current) {
      backdropRef.current.style.opacity = progress.toString();
      backdropRef.current.style.setProperty('backdrop-filter', `blur(${blurVal}px)`);
      backdropRef.current.style.setProperty('-webkit-backdrop-filter', `blur(${blurVal}px)`);
    }
  };

  const handleTouchEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const threshold = 80;
    const offset = currentDragOffsetRef.current;

    if (offset > threshold) {
      setIsClosing(true);
      setIsDraggedClose(true);
      if (panelRef.current) {
        panelRef.current.style.transition = 'transform 240ms cubic-bezier(0.32, 0.94, 0.6, 1)';
        panelRef.current.style.transform = 'translate3d(0, 100vh, 0)';
      }
      if (backdropRef.current) {
        backdropRef.current.style.transition = 'opacity 240ms cubic-bezier(0.32, 0.94, 0.6, 1), backdrop-filter 240ms cubic-bezier(0.32, 0.94, 0.6, 1), -webkit-backdrop-filter 240ms cubic-bezier(0.32, 0.94, 0.6, 1)';
        backdropRef.current.style.opacity = '0';
        backdropRef.current.style.setProperty('backdrop-filter', 'blur(0px)');
        backdropRef.current.style.setProperty('-webkit-backdrop-filter', 'blur(0px)');
      }
      window.setTimeout(() => {
        onClose();
      }, 240);
    } else {
      if (panelRef.current) {
        panelRef.current.style.transition = 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)';
        panelRef.current.style.transform = 'translate3d(0, 0, 0)';
      }
      if (backdropRef.current) {
        backdropRef.current.style.transition = 'opacity 300ms cubic-bezier(0.16, 1, 0.3, 1), backdrop-filter 300ms cubic-bezier(0.16, 1, 0.3, 1), -webkit-backdrop-filter 300ms cubic-bezier(0.16, 1, 0.3, 1)';
        backdropRef.current.style.opacity = '1';
        backdropRef.current.style.setProperty('backdrop-filter', 'blur(12px)');
        backdropRef.current.style.setProperty('-webkit-backdrop-filter', 'blur(12px)');
      }
    }
  };

  useEffect(() => {
    return () => {
      if (mouseMoveListenerRef.current) {
        window.removeEventListener('mousemove', mouseMoveListenerRef.current);
      }
      if (mouseUpListenerRef.current) {
        window.removeEventListener('mouseup', mouseUpListenerRef.current);
      }
    };
  }, []);

  const playerOptions = players.filter(p => p.active !== false && !p.deleted_at);
  const ids = (m: any) => [m.win_1, m.win_2, m.lose_1, m.lose_2].filter(Boolean);
  const team = (m: any, id: string) => ([m.win_1, m.win_2].includes(id) ? 'win' : [m.lose_1, m.lose_2].includes(id) ? 'loss' : null);
  const matchesBaseFilters = (m: any) => {
    if (member1 && !ids(m).includes(member1)) return false;
    if (member2 && !ids(m).includes(member2)) return false;
    if (member1 && member2 && relation !== '-') {
      const t1 = team(m, member1);
      const t2 = team(m, member2);
      if (!t1 || !t2) return false;
      if (relation === 'partner' && t1 !== t2) return false;
      if (relation === 'opponent' && t1 === t2) return false;
    }
    return true;
  };
  const matchesWithoutResultFilter = matches.filter(matchesBaseFilters);
  const filteredMatches = matchesWithoutResultFilter.filter(m => {
    if (member1 && result !== '-' && team(m, member1) !== result) return false;
    return true;
  });

  const memberSummary = member1 && !isGuestId(member1)
    ? matchesWithoutResultFilter.reduce((acc, m) => {
      const t = team(m, member1);
      if (t === 'win') acc.wins++;
      if (t === 'loss') acc.losses++;
      return acc;
    }, { wins: 0, losses: 0 })
    : null;
  const summaryTotal = memberSummary ? memberSummary.wins + memberSummary.losses : 0;
  const wr = summaryTotal ? ((memberSummary!.wins / summaryTotal) * 100).toFixed(1) : '0.0';
  const summarizeForMember1 = (list: any[]) => {
    if (!member1 || isGuestId(member1)) return null;
    return list.reduce((acc, m) => {
      const t = team(m, member1);
      if (t === 'win') acc.wins++;
      if (t === 'loss') acc.losses++;
      return acc;
    }, { wins: 0, losses: 0 });
  };

  const grouped: Record<string, any[]> = {};
  filteredMatches.forEach(m => { (grouped[m.season ?? 'Season 1'] ??= []).push(m); });
  
  const requestClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    if (backdropRef.current) {
      backdropRef.current.style.transition = 'opacity 240ms cubic-bezier(0.32, 0.94, 0.6, 1), backdrop-filter 240ms cubic-bezier(0.32, 0.94, 0.6, 1), -webkit-backdrop-filter 240ms cubic-bezier(0.32, 0.94, 0.6, 1)';
      backdropRef.current.style.opacity = '0';
      backdropRef.current.style.setProperty('backdrop-filter', 'blur(0px)');
      backdropRef.current.style.setProperty('-webkit-backdrop-filter', 'blur(0px)');
    }
    if (panelRef.current) {
      panelRef.current.style.transition = 'transform 240ms cubic-bezier(0.32, 0.94, 0.6, 1)';
      panelRef.current.style.transform = 'translate3d(0, 100vh, 0)';
    }
    window.setTimeout(onClose, 240); // Khớp với duration 250ms của animation đóng
  };

  return (
    <div className={cn("fixed inset-0 z-[1100] flex items-end justify-center p-0 sm:items-center sm:p-4", isClosing && "pointer-events-none")}>
      <div 
        ref={backdropRef} 
        className="history-modal-backdrop absolute inset-0 bg-black/65 backdrop-blur-md" 
        onClick={requestClose} 
      />
      {deleteTarget && (
        <ConfirmDelete
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const id = deleteTarget;
            setDeleteTarget(null);
            setIsDeletingId(id);
            start(async () => {
              await onDeleteMatch?.(id);
              setIsDeletingId(null);
            });
          }}
        />
      )}
      <div 
        ref={panelRef} 
        className={cn(
          "history-modal-panel relative flex h-[92vh] w-full flex-col overflow-hidden rounded-t-[2.5rem] border border-slate-800/80 bg-[#0b1329]/98 shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:h-auto sm:max-h-[88vh] sm:max-w-[1100px] sm:rounded-[2rem] xl:max-w-[1180px]", 
          isClosing && !isDraggedClose && "history-modal-panel-out"
        )}
      >
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          className="flex flex-col shrink-0 select-none cursor-grab active:cursor-grabbing"
        >
          <div className="mx-auto my-3 h-1.5 w-12 rounded-full bg-slate-700/50 sm:hidden" />
          <div className="flex items-center justify-between px-6 pb-5 sm:px-8 sm:py-6 border-b border-slate-800/80 bg-[#0f1b32]/90 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                <History className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-black text-xl sm:text-2xl text-white tracking-tight">Lịch sử trận đấu</h2>
                <p className="text-[10px] sm:text-[11px] text-slate-400/80 font-bold uppercase tracking-widest mt-0.5">{matches.length} trận đấu được ghi lại</p>
              </div>
            </div>
            <button onClick={requestClose} className="w-11 h-11 rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center transition-all active:scale-90">
              <X className="w-5 h-5 text-slate-200/70" />
            </button>
          </div>
        </div>
        <div className="border-b border-slate-800/80 bg-[#0d1627]/80 px-4 sm:px-8 py-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select value={member1} onChange={e => { const v = e.target.value; setMember1(v); if (!v) setResult('-'); if (v && v === member2) setMember2(''); }} className="rounded-xl !bg-[#15233c] border border-slate-800 px-3 py-2.5 text-xs sm:text-sm font-bold text-white/85">
              <option value="">Thành viên 1</option>
              {playerOptions.map(p => <option key={p.id} value={p.id}>{isGuestId(p.id) ? 'Khách' : p.name}</option>)}
            </select>
            <select value={member2} onChange={e => { const v = e.target.value; setMember2(v === member1 ? '' : v); if (!member1 || !v || v === member1) setRelation('-'); }} className="rounded-xl !bg-[#15233c] border border-slate-800 px-3 py-2.5 text-xs sm:text-sm font-bold text-white/85">
              <option value="">Thành viên 2</option>
              {playerOptions.filter(p => p.id !== member1).map(p => <option key={p.id} value={p.id}>{isGuestId(p.id) ? 'Khách' : p.name}</option>)}
            </select>
            <select value={relation} disabled={!member1 || !member2} onChange={e => setRelation(e.target.value as typeof relation)} className="rounded-xl !bg-[#15233c] border border-slate-800 px-3 py-2.5 text-xs sm:text-sm font-bold text-white/85 disabled:opacity-35">
              <option value="-">Quan hệ</option>
              <option value="partner">Hợp tác</option>
              <option value="opponent">Đối đầu</option>
            </select>
            <select value={result} disabled={!member1} onChange={e => setResult(e.target.value as typeof result)} className="rounded-xl !bg-[#15233c] border border-slate-800 px-3 py-2.5 text-xs sm:text-sm font-bold text-white/85 disabled:opacity-35">
              <option value="-">Kết quả</option>
              <option value="win">Thắng</option>
              <option value="loss">Thua</option>
            </select>
          </div>
          <div className="text-[11px] sm:text-xs font-black text-slate-400/80 uppercase tracking-widest">
            Đang hiện {filteredMatches.length}/{matches.length} trận
            {memberSummary && ` · ${memberSummary.wins}W / ${memberSummary.losses}L · WR ${wr}%`}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-7 space-y-8 bg-[#090f1c]/95">
          {Object.entries(grouped).map(([season, list]) => (
            <div key={season} className="space-y-4">
              <div className="flex items-center gap-3 px-1">
                <span className="text-[10px] font-black text-primary px-3 py-1 bg-primary/10 rounded-full uppercase tracking-[0.2em]">{season}</span>
                <div className="h-px flex-1 bg-white/[0.05]" />
                <span className="text-[10px] text-white/20 font-bold uppercase tracking-widest">{list.length} trận</span>
              </div>
              <div className="space-y-6">
                {groupMatchesByDay(list).map(day => {
                  const daySummaryMatches = matchesWithoutResultFilter.filter(m =>
                    (m.season ?? 'Season 1') === season && dateKeyOf(m.date) === day.key
                  );
                  const daySummary = summarizeForMember1(daySummaryMatches);
                  const daySummaryTotal = daySummary ? daySummary.wins + daySummary.losses : 0;
                  const dayWr = daySummaryTotal ? ((daySummary!.wins / daySummaryTotal) * 100).toFixed(1) : '0.0';

                  return (
                  <div key={day.key} className="space-y-3">
                    <div className={cn(
                      'relative overflow-hidden rounded-xl border px-3.5 py-3 shadow-sm',
                      day.isToday
                        ? 'border-primary/30 bg-primary/[0.10] shadow-primary/5'
                        : 'border-slate-800/80 bg-[#121c2e]/90 shadow-black/15'
                    )}>
                      <div className={cn(
                        'absolute inset-y-0 left-0 w-1',
                        day.isToday ? 'bg-primary' : 'bg-white/15'
                      )} />
                      <div className="flex flex-wrap items-center justify-between gap-3 pl-1">
                        <div className="min-w-0 flex items-center gap-2">
                          <Calendar className={cn('w-3.5 h-3.5 shrink-0', day.isToday ? 'text-primary' : 'text-slate-400')} />
                          <span className={cn(
                            'truncate text-[11px] sm:text-xs font-black uppercase tracking-[0.18em]',
                            day.isToday ? 'text-primary' : 'text-slate-300'
                          )}>
                            {day.isToday ? 'Hôm nay' : day.dateLabel}
                          </span>
                          {day.isToday && (
                            <span className="shrink-0 text-[10px] font-black text-primary/45 tabular-nums">
                              {day.dateLabel}
                            </span>
                          )}
                        </div>
                        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
                          {daySummary && (
                            <span className={cn(
                              'rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest tabular-nums',
                              day.isToday
                                  ? 'border-primary/25 bg-primary/10 text-primary'
                                  : 'border-slate-800 bg-white/[0.02] text-slate-300'
                            )}>
                              {daySummary.wins}W / {daySummary.losses}L - WR {dayWr}%
                            </span>
                          )}
                          <span className={cn(
                          'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest tabular-nums',
                        day.isToday
                          ? 'border-primary/25 bg-primary/10 text-primary'
                          : 'border-slate-800 bg-white/[0.02] text-slate-300'
                        )}>
                          {day.matches.length} trận
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className={cn('space-y-2 border-l-2 pl-3.5', day.isToday ? 'border-primary/35' : 'border-white/[0.07]')}>
                      {day.matches.map((m: any) => (
                        <MatchCard key={m.id} m={m} players={players} canEdit={canEdit} isDeleting={isDeletingId === m.id} onDelete={() => setDeleteTarget(m.id)} matchExpected={matchExpected} />
                      ))}
                    </div>
                  </div>
                  );
                })}
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
  const syncFailed = m.pending && m.sync_status === 'error';
  const syncLabel = syncFailed ? 'Lưu lỗi' : 'Đang lưu...';
  const syncClass = syncFailed ? 'text-red-300/90' : 'text-amber-300/80';
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      if (canEdit && !m.pending && !isDeleting) {
        onDelete();
      }
    },
    preventScrollOnSwipe: false,
    trackMouse: true
  });
  return (
    <div {...swipeHandlers} className="group relative flex overflow-hidden rounded-2xl border border-slate-800/80 bg-[#0f172a]/90 shadow-[0_10px_28px_rgba(0,0,0,0.12)] transition-all hover:bg-[#15233c]/90">
      <div className="flex w-[64px] shrink-0 flex-col items-center justify-center gap-1 border-r border-slate-800/80 bg-white/[0.015] px-2 py-3 sm:w-24">
        <span className="text-[15px] font-black leading-none text-slate-200/85 tabular-nums sm:text-[17px]">{time}</span>
        <span className="text-[10px] font-bold text-slate-400/75 tabular-nums sm:text-[11px]">{date}</span>
      </div>
      <div className={cn("min-w-0 flex-1 px-3 py-3 sm:px-5 sm:py-4", canEdit && "pr-9 sm:pr-11")}>
        {canEdit && !m.pending && (
          <motion.button whileTap={{ scale: 0.85 }} disabled={isDeleting} onClick={onDelete} className={cn("absolute right-2 top-2 rounded-lg p-1.5 text-white/25 transition-all hover:bg-red-500/10 hover:text-red-400 active:scale-90", isDeleting && "pointer-events-none opacity-50")}>
            {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </motion.button>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-5" data-mobile-match-row>
          <div className="min-w-0 space-y-0.5 text-right">
            <MobilePlayerName players={players} id={m.win_1} className="truncate text-sm font-black text-white/90" />
            <div className="hidden truncate text-base font-black text-white/90 sm:block">{name(m.win_1)}</div>
            {m.win_2 && (
              <>
                <MobilePlayerName players={players} id={m.win_2} className="truncate text-sm font-black text-white/90" />
                <div className="hidden truncate text-base font-black text-white/90 sm:block">{name(m.win_2)}</div>
              </>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-center">
            <div className="rounded-xl border border-primary/25 bg-primary/[0.12] px-3 py-1.5 text-sm font-black text-primary shadow-lg shadow-primary/5 tabular-nums sm:px-4 sm:text-base">
              <span data-mobile-score>{m.win_score}–{m.lose_score}</span>
            </div>
            {m.pending && (
              <span className={cn('mt-1 text-[8px] font-black uppercase tracking-widest sm:text-[9px]', syncClass)}>{syncLabel}</span>
            )}
            {expected && (
              <span className="mt-1 block whitespace-nowrap text-[8px] font-bold tracking-tight text-slate-400 sm:text-[9px]">
                <span className="sm:hidden">{Math.round(expected.winProb * 100)}% - {Math.round(expected.loseProb * 100)}%</span>
                <span className="hidden sm:inline">Dự đoán trước trận: {Math.round(expected.winProb * 100)}% - {Math.round(expected.loseProb * 100)}%</span>
              </span>
            )}
          </div>
          <div className="min-w-0 space-y-0.5 text-left">
            <MobilePlayerName players={players} id={m.lose_1} className="truncate text-sm font-black text-white/90" />
            <div className="hidden truncate text-base font-black text-white/90 sm:block">{name(m.lose_1)}</div>
            {m.lose_2 && (
              <>
                <MobilePlayerName players={players} id={m.lose_2} className="truncate text-sm font-black text-white/90" />
                <div className="hidden truncate text-base font-black text-white/90 sm:block">{name(m.lose_2)}</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SwipeableCompactRow({ children, onSwipeLeft }: { children: ReactNode; onSwipeLeft: () => void }) {
  const handlers = useSwipeable({
    onSwipedLeft: onSwipeLeft,
    preventScrollOnSwipe: false,
    trackMouse: true
  });
  return <div {...handlers} className="recent-history-compact-row relative min-h-[72px]" data-mobile-match-row>{children}</div>;
}

// ─── Main RecentHistory ───────────────────────────────────────────────────────
export function RecentHistory({ matches, players, canEdit = false, matchExpected, defaultShowAll = false, onDeleteMatch }: { matches: any[]; players: any[]; canEdit?: boolean; matchExpected?: any; defaultShowAll?: boolean; onDeleteMatch?: (matchId: string) => Promise<void> | void }) {
  const [showAll, setShowAll] = useState(defaultShowAll);
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
      {showAll && (
        <PortalLayer>
          <HistoryModal matches={matches} players={players} canEdit={canEdit} onClose={() => setShowAll(false)} matchExpected={matchExpected} onDeleteMatch={onDeleteMatch} />
        </PortalLayer>
      )}
      {deleteTarget && (
        <PortalLayer>
          <ConfirmDelete
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => {
              const id = deleteTarget;
              setDeleteTarget(null);
              setIsDeletingId(id);
              start(async () => {
                await onDeleteMatch?.(id);
                setIsDeletingId(null);
              });
            }}
          />
        </PortalLayer>
      )}

      <div className="recent-history-container w-full rounded-2xl border border-white/[0.06] bg-slate-900/80 overflow-hidden">
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
          const syncFailed = m.pending && m.sync_status === 'error';
          const syncLabel = syncFailed ? 'Lưu lỗi' : 'Đang lưu...';
          const syncClass = syncFailed ? 'text-red-300/90' : 'text-amber-300/80';

          return (
            <div key={m.id}
              className={cn('border-b border-white/[0.04] last:border-0', idx % 2 === 1 && 'bg-white/[0.015]')}>

              {/* ── PC ─────────────────────────────────────────────────── */}
              <div className="recent-history-desktop-row items-stretch min-h-[72px]">
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
                  {m.pending && (
                    <span className={cn('mt-1 text-[9px] font-black uppercase tracking-widest', syncClass)}>{syncLabel}</span>
                  )}
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
                  {canEdit && !m.pending && (
                    <motion.button whileTap={{ scale: 0.85 }} disabled={isDeletingId === m.id} onClick={() => setDeleteTarget(m.id)}
                      className={cn("p-2 text-white/15 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors", isDeletingId === m.id && "opacity-50 pointer-events-none")}>
                      {isDeletingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </motion.button>
                  )}
                </div>
              </div>

              {/* ── COMPACT ─────────────────────────────────────────────── */}
              <SwipeableCompactRow onSwipeLeft={() => { if (canEdit && !m.pending && isDeletingId !== m.id) setDeleteTarget(m.id); }}>
                <div className="flex">
                  <div className="flex w-[64px] shrink-0 flex-col items-center justify-center gap-1 border-r border-white/[0.05] bg-white/[0.015] px-2 py-3">
                    <span className="text-[15px] font-black leading-none text-white/75 tabular-nums">{time}</span>
                    <span className="text-[10px] font-bold text-white/30 tabular-nums">{date}</span>
                  </div>

                  <div className={cn("min-w-0 flex-1 px-3 py-3", canEdit && "pr-9")}>
                    {canEdit && !m.pending && (
                      <motion.button whileTap={{ scale: 0.85 }} disabled={isDeletingId === m.id} onClick={() => setDeleteTarget(m.id)}
                        className={cn("absolute right-2 top-2 rounded-lg p-1.5 text-white/15 transition-colors hover:bg-red-500/10 hover:text-red-400", isDeletingId === m.id && "pointer-events-none opacity-50")}>
                        {isDeletingId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </motion.button>
                    )}

                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                      <div className="min-w-0 space-y-0.5 text-right">
                        <CompactRecentPlayerName players={players} id={m.win_1} className="text-[13px] font-bold leading-snug text-white/85" />
                        {isDouble && <CompactRecentPlayerName players={players} id={m.win_2} className="text-[13px] font-bold leading-snug text-white/85" />}
                      </div>

                      <div className="flex shrink-0 flex-col items-center">
                        <div className="min-w-[62px] rounded-xl border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-center text-sm font-black text-primary tabular-nums whitespace-nowrap">
                          <span data-mobile-score>{m.win_score}–{m.lose_score}</span>
                        </div>
                        {m.pending && (
                          <span className={cn('mt-1 text-[8px] font-black uppercase tracking-widest', syncClass)}>{syncFailed ? 'Lưu lỗi' : 'Đang lưu'}</span>
                        )}
                        {matchExpected?.get(m.id) && (
                          <span className="mt-1 block whitespace-nowrap text-[8px] font-bold tracking-tight text-white/30">
                            {Math.round(matchExpected.get(m.id).winProb * 100)}% - {Math.round(matchExpected.get(m.id).loseProb * 100)}%
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 space-y-0.5 text-left">
                        <CompactRecentPlayerName players={players} id={m.lose_1} className="text-[13px] font-bold leading-snug text-white/85" />
                        {isDouble && <CompactRecentPlayerName players={players} id={m.lose_2} className="text-[13px] font-bold leading-snug text-white/85" />}
                      </div>
                    </div>
                  </div>
                </div>
              </SwipeableCompactRow>

            </div>
          );
        })}
      </div>
    </>
  );
}
