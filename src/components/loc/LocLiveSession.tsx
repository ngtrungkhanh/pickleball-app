'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LocSession,
  LocRound,
  LocDebtItem,
  calculatePairwiseDebts,
  calculateOptimizedSettlement,
  calculatePlayerStats,
  isLocChopAdjustment,
  getShortNameMap,
  PlayerSessionStats,
} from '@/lib/loc-core';
import { LocDebtMatrix } from './LocDebtMatrix';
import { LocAddRoundModal } from './LocAddRoundModal';
import { LocPlayerProfileModal } from './LocPlayerProfileModal';
import {
  ChevronLeft,
  Share2,
  Plus,
  Trash2,
  Sparkles,
  History,
  Grid,
  CreditCard,
  CheckCircle2,
} from 'lucide-react';

interface LocLiveSessionProps {
  initialSession: LocSession;
  initialRounds: LocRound[];
  onBackToLobby: () => void;
  onAddRound: (winnerId: string, debts: LocDebtItem[]) => Promise<void>;
  onDeleteRound: (roundId: string) => Promise<void>;
  onRefreshData: () => Promise<{ session: LocSession | null; rounds: LocRound[] }>;
}

export function LocLiveSession({
  initialSession,
  initialRounds,
  onBackToLobby,
  onAddRound,
  onDeleteRound,
  onRefreshData,
}: LocLiveSessionProps) {
  const [session, setSession] = useState<LocSession>(initialSession);
  const [rounds, setRounds] = useState<LocRound[]>(initialRounds);
  const [activeTab, setActiveTab] = useState<'matrix' | 'settlement' | 'history'>('settlement');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedPlayerStats, setSelectedPlayerStats] = useState<PlayerSessionStats | null>(null);
  const [copied, setCopied] = useState(false);
  const [deletingRoundId, setDeletingRoundId] = useState<string | null>(null);

  // Polling realtime sync
  const refresh = useCallback(async () => {
    try {
      const data = await onRefreshData();
      if (data.session) {
        setSession(data.session);
        setRounds(data.rounds);
      }
    } catch (e) {
      console.error('Polling refresh error:', e);
    }
  }, [onRefreshData]);

  useEffect(() => {
    const checkSync = async () => {
      if (document.visibilityState !== 'visible') return;

      try {
        const res = await fetch(`/api/loc/sync?sessionId=${session.id}`);
        if (res.status === 404) {
          onBackToLobby();
          return;
        }
        if (res.ok) {
          const body = await res.json();
          if (body.version && body.version > session.version) {
            await refresh();
          }
        }
      } catch {
        // im lặng khi offline/mạng yếu
      }
    };

    const timer = setInterval(checkSync, 2500);

    return () => clearInterval(timer);
  }, [session.id, session.version, refresh, onBackToLobby]);

  // BroadcastChannel cho cùng thiết bị
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      if ('BroadcastChannel' in window) {
        bc = new BroadcastChannel(`loc_session_${session.id}`);
        bc.onmessage = () => {
          void refresh();
        };
      }
    } catch {}

    return () => {
      bc?.close();
    };
  }, [session.id, refresh]);

  const notifyBroadcast = () => {
    try {
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel(`loc_session_${session.id}`);
        bc.postMessage({ updated: true });
        bc.close();
      }
    } catch {}
  };

  // Bảng tên ngắn gọn (nếu trùng thêm viết tắt T.Khánh)
  const shortNameMap = useMemo(() => {
    return getShortNameMap(session.players);
  }, [session.players]);

  const displayPlayers = useMemo(() => {
    return session.players.map(p => ({
      id: p.id,
      name: shortNameMap.get(p.id) || p.name,
    }));
  }, [session.players, shortNameMap]);

  // Tính toán
  const playerStats = useMemo(() => {
    return calculatePlayerStats(displayPlayers, rounds);
  }, [displayPlayers, rounds]);

  const { matrix, directList } = useMemo(() => {
    return calculatePairwiseDebts(displayPlayers, rounds);
  }, [displayPlayers, rounds]);

  const settlements = useMemo(() => {
    return calculateOptimizedSettlement(displayPlayers, rounds);
  }, [displayPlayers, rounds]);

  const adjustmentCount = useMemo(() => rounds.filter(r => isLocChopAdjustment(r, session.players)).length, [rounds, session.players]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Tính điểm: ${session.title}`,
          url,
        });
        return;
      } catch {}
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Đã copy link buổi chơi');
    }
  };

  const handleSaveRound = async (winnerId: string, debts: LocDebtItem[]) => {
    await onAddRound(winnerId, debts);
    notifyBroadcast();
    await refresh();
  };

  const handleDeleteRound = async (roundId: string) => {
    if (!confirm('Bạn có chắc muốn xóa ván này?')) return;
    try {
      setDeletingRoundId(roundId);
      await onDeleteRound(roundId);
      notifyBroadcast();
      await refresh();
    } finally {
      setDeletingRoundId(null);
    }
  };

  return (
    <div className="-mx-4 -mt-5 min-h-dvh bg-slate-950 text-white flex flex-col pb-24">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-white/10 px-3 sm:px-4 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          <button
            onClick={onBackToLobby}
            className="p-1 -ml-1 text-white/60 hover:text-white rounded-lg hover:bg-white/10 shrink-0"
            title="Về danh sách"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 title={session.title} className="text-[11px]! sm:text-sm! font-bold text-white/95 leading-tight truncate">
              {session.title}
            </h1>
            <div className="flex items-center gap-1.5 text-[10px] text-white/50 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span>Trực tiếp · {rounds.length - adjustmentCount} ván{adjustmentCount > 0 && ` · ${adjustmentCount} chặt 2`}</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-xs font-semibold text-white/80 hover:bg-white/10 transition-colors shrink-0"
        >
          {copied ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-bold text-[11px] sm:text-xs">Đã chép link</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] sm:text-xs">Chia sẻ</span>
            </>
          )}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 max-w-2xl w-full mx-auto p-2.5 sm:p-4 space-y-3 sm:space-y-4">
        {/* Scoreboard Cards */}
        <div>
        <h2 className="mb-1.5 text-[10px] font-semibold text-white/50">Tổng hợp kết quả · {playerStats.length} người · điểm</h2>
        <div className="grid gap-1 sm:gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(playerStats.length, 1), 5)}, minmax(0, 1fr))` }}>
          {playerStats.map((p, idx) => {
            const isPositive = p.netCards > 0;
            const isZero = p.netCards === 0;

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlayerStats(p)}
                aria-label={`${p.name}: ${p.netCards > 0 ? '+' : ''}${p.netCards} điểm. Xem chi tiết`}
                className="min-w-0 px-1 py-2 sm:p-3 rounded-xl bg-slate-900 border border-white/10 text-center hover:border-amber-500/40 transition-all active:scale-[0.98] relative overflow-hidden group"
              >
                <div className={`truncate text-[10px] sm:text-xs font-bold ${idx === 0 && isPositive ? 'text-amber-300' : 'text-white/90'}`} title={p.name}>{p.name}</div>

                <div
                  className={`my-1 text-sm sm:text-lg font-mono font-black tracking-tight break-all ${
                    isPositive ? 'text-emerald-400' : isZero ? 'text-white/40' : 'text-red-400'
                  }`}
                >
                  {isPositive ? `+${p.netCards}` : p.netCards}
                </div>

                <div className="text-[9px] sm:text-[10px] text-white/40 tabular-nums">
                  <span title={`${p.wins} thắng · ${p.losses} bại`}>{p.wins}T · {p.losses}B</span>
                </div>
              </button>
            );
          })}
        </div>
        </div>

        {/* Tab Selection */}
        <div className="flex rounded-xl bg-slate-900/90 border border-white/10 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('matrix')}
            className={`flex-1 min-h-11 py-2 rounded-lg text-[10px] sm:text-xs font-bold flex items-center justify-center gap-1 transition-all ${
              activeTab === 'matrix'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-white/50 hover:text-white'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Sổ nợ</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settlement')}
            className={`flex-1 min-h-11 py-2 rounded-lg text-[10px] sm:text-xs font-bold flex items-center justify-center gap-1 transition-all ${
              activeTab === 'settlement'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-white/50 hover:text-white'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Bù trừ tối ưu</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex-1 min-h-11 py-2 rounded-lg text-[10px] sm:text-xs font-bold flex items-center justify-center gap-1 transition-all ${
              activeTab === 'history'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-white/50 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Lịch sử ({rounds.length})</span>
          </button>
        </div>

        {/* Tab 1: Sổ nợ ma trận */}
        {activeTab === 'matrix' && (
          <LocDebtMatrix players={displayPlayers} matrix={matrix} directList={directList} />
        )}

        {/* Tab 2: Bù trừ tối ưu (Cấp độ 2) */}
        {activeTab === 'settlement' && (
          <div className="rounded-2xl bg-slate-900/90 border border-white/10 p-3 sm:p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs sm:text-sm font-bold text-white">
                Bù trừ tối ưu
              </h3>
            </div>
            <p className="text-[11px] text-white/50">
              {settlements.length} lượt chuyển · Giảm số lần thanh toán
            </p>

            {settlements.length === 0 ? (
              <div className="py-6 text-center text-xs text-white/40 italic">
                Chưa có nợ cần thanh toán
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                {settlements.map((s, idx) => (
                  <div
                    key={`${s.fromId}-${s.toId}-${idx}`}
                    className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-white/[0.03] border border-white/5"
                  >
                    <div className="flex min-w-0 items-center gap-1.5 text-xs sm:text-sm">
                      <span className="font-bold text-red-400 break-words min-w-0">{s.fromName}</span>
                      <span className="text-white/40 shrink-0" aria-label="chuyển cho">→</span>
                      <span className="font-bold text-emerald-400 break-words min-w-0">{s.toName}</span>
                    </div>
                    <div className="shrink-0 font-mono font-black text-amber-400 text-sm sm:text-base">
                      {s.cards} <span className="text-xs font-normal text-white/50">điểm</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Lịch sử từng ván */}
        {activeTab === 'history' && (
          <div className="space-y-2.5">
            {rounds.length === 0 ? (
              <div className="py-12 text-center text-xs text-white/40 italic rounded-2xl bg-slate-900 border border-white/5">
                Chưa có ván nào. Bấm nút &quot;+ Ván mới&quot; bên dưới để nhập ván đầu tiên!
              </div>
            ) : (
              [...rounds].reverse().map(round => {
                const winnerName = shortNameMap.get(round.winnerId) || 'Người thắng';
                const totalWon = round.debts.reduce((sum, d) => sum + (d.cards || 0), 0);
                const isAdjustment = isLocChopAdjustment(round, session.players);

                return (
                  <div
                    key={round.id}
                    className="p-3.5 rounded-2xl bg-slate-900 border border-white/10 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 font-mono font-bold text-xs flex items-center justify-center">
                          #{round.roundNumber}
                        </span>
                        <span className="font-bold text-sm text-emerald-400">
                          {isAdjustment ? '⚔️ Chặt 2 ·' : '🏆'} {winnerName} {isAdjustment ? 'nhận' : 'ăn'} (+{totalWon} điểm)
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteRound(round.id)}
                        disabled={deletingRoundId === round.id}
                        className="p-1.5 text-white/30 hover:text-red-400 rounded-lg hover:bg-white/5"
                        title="Xóa ván"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {isAdjustment && <p className="text-[11px] text-amber-300/80">Điều chỉnh điểm · Không tính thắng/thua</p>}

                    {/* Chi tiết người thua */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {round.debts.map(d => {
                        const loserName = shortNameMap.get(d.loserId) || 'Người thua';
                        return (
                          <div
                            key={d.loserId}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/5 text-xs"
                          >
                            <span className="text-white/80">{loserName}:</span>
                            <span className="font-mono font-bold text-red-400">-{d.cards}</span>
                            {d.autoTag && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 uppercase">
                                {d.autoTag}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Sticky Bottom Floating Action Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent z-20 pointer-events-none">
        <div className="max-w-md mx-auto pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="w-full py-3.5 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_8px_30px_rgba(16,185,129,0.35)] active:scale-[0.98] transition-all"
          >
            <Plus className="w-5 h-5 stroke-[3]" />
            <span>Ván mới</span>
          </button>
        </div>
      </div>

      {/* Modal nhập ván mới */}
      {isAddModalOpen && (
        <LocAddRoundModal
          key={`round-${rounds.length + 1}`}
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          players={displayPlayers}
          roundNumber={rounds.length + 1}
          onSave={handleSaveRound}
        />
      )}

      {/* Modal hồ sơ cá nhân */}
      <LocPlayerProfileModal
        playerStats={selectedPlayerStats}
        onClose={() => setSelectedPlayerStats(null)}
      />
    </div>
  );
}
