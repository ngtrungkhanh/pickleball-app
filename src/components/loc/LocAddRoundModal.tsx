'use client';

import React, { useState, useMemo } from 'react';
import { LocPlayer, LocDebtItem, detectRoundTags } from '@/lib/loc-core';
import { Trophy, X, Plus, Minus, Check, AlertCircle } from 'lucide-react';

interface LocAddRoundModalProps {
  isOpen: boolean;
  onClose: () => void;
  players: LocPlayer[];
  roundNumber: number;
  onSave: (winnerId: string, debts: LocDebtItem[]) => Promise<void>;
}

export function LocAddRoundModal({
  isOpen,
  onClose,
  players,
  roundNumber,
  onSave,
}: LocAddRoundModalProps) {
  const [winnerId, setWinnerId] = useState<string>(players[0]?.id || '');
  const [loserCards, setLoserCards] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    players.forEach(p => {
      init[p.id] = 0;
    });
    return init;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const losers = useMemo(() => {
    return players.filter(p => p.id !== winnerId);
  }, [players, winnerId]);

  // Nhận diện thông minh
  const detectedTags = useMemo(() => {
    const debts = losers.map(l => ({
      loserId: l.id,
      cards: loserCards[l.id] || 0,
    }));
    return detectRoundTags(winnerId, debts, players.length);
  }, [winnerId, losers, loserCards, players.length]);

  const totalWon = useMemo(() => {
    return losers.reduce((sum, l) => sum + (loserCards[l.id] || 0), 0);
  }, [losers, loserCards]);

  if (!isOpen) return null;

  const handleCardChange = (loserId: string, amount: number) => {
    setLoserCards(prev => ({
      ...prev,
      [loserId]: Math.max(0, amount),
    }));
  };

  const handleQuickPreset = (loserId: string, val: number) => {
    handleCardChange(loserId, val);
  };

  const handleAllEatSamPreset = () => {
    // Ăn sâm = mỗi nhà đền 20 lá
    setLoserCards(prev => {
      const next = { ...prev };
      losers.forEach(l => {
        next[l.id] = 20;
      });
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!winnerId) {
      setError('Vui lòng chọn người thắng ván này');
      return;
    }
    if (totalWon <= 0) {
      setError('Tổng số lá người thua phải lớn hơn 0');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const debts: LocDebtItem[] = losers.map(l => ({
        loserId: l.id,
        cards: loserCards[l.id] || 0,
        autoTag: detectedTags[l.id],
      }));

      await onSave(winnerId, debts);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi khi lưu ván đấu');
    } finally {
      setIsSubmitting(false);
    }
  };

  const winnerName = players.find(p => p.id === winnerId)?.name || 'Người thắng';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-lg max-h-[92vh] flex flex-col bg-slate-900 border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 font-black text-sm">
              #{roundNumber}
            </span>
            <h3 className="text-base font-bold text-white">Nhập điểm ván mới</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/50 hover:text-white rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Bước 1: Chọn người thắng */}
          <div>
            <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">
              1. Ai về nhất? (Người thắng)
            </label>
            <div className={`grid gap-1.5 ${players.length <= 4 ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-5'}`}>
              {players.map(p => {
                const isSelected = p.id === winnerId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setWinnerId(p.id)}
                    className={`flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl border text-center transition-all ${
                      isSelected
                        ? 'bg-emerald-500/25 border-emerald-500 text-emerald-300 font-bold shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                        : 'bg-white/[0.03] border-white/10 text-white/75 hover:bg-white/[0.08]'
                    }`}
                  >
                    {isSelected ? (
                      <Trophy className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-white/10 text-white/60 text-[10px] font-bold flex items-center justify-center shrink-0">
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="truncate text-xs font-bold">{p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Phím tắt Sâm toàn bàn */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAllEatSamPreset}
              className="flex-1 py-1.5 px-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold hover:bg-amber-500/20 transition-colors"
            >
              ⚡ Báo sâm thành công (Ăn cả làng 20 lá)
            </button>
          </div>

          {/* Bước 2: Nhập số lá người thua */}
          <div>
            <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
              2. Số lá thua của từng người
            </label>

            <div className="space-y-3">
              {losers.map(loser => {
                const cards = loserCards[loser.id] || 0;
                const tag = detectedTags[loser.id];

                return (
                  <div
                    key={loser.id}
                    className="p-3 rounded-xl bg-white/[0.02] border border-white/10 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 font-bold text-xs flex items-center justify-center">
                          {loser.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="font-bold text-sm text-white">{loser.name}</span>
                        {tag && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-amber-500/20 border border-amber-500/40 text-amber-300">
                            {tag === 'cóng' && '🥶 Cóng'}
                            {tag === 'ăn sâm' && '⚡ Bị sâm'}
                            {tag === 'đền sâm' && '💥 Đền sâm'}
                            {tag === 'thối heo' && '🐷 Thối heo'}
                            {tag === 'chặt heo' && '⚔️ Chặt heo'}
                          </span>
                        )}
                      </div>

                      {/* Hiển thị số lá to & Stepper */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCardChange(loser.id, cards - 1)}
                          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center active:scale-95"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="min-w-[40px] text-center font-mono font-black text-lg text-red-400">
                          {cards}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCardChange(loser.id, cards + 1)}
                          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Bàn phím số 0-20 (7 cột x 3 hàng, số 14 được tô màu viền nổi bật) */}
                    <div className="grid grid-cols-7 gap-1">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(num => {
                        const isSelected = cards === num;
                        const is14 = num === 14;

                        let btnClass = 'h-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center ';
                        if (is14) {
                          btnClass += isSelected
                            ? 'bg-amber-500 text-slate-950 font-black border border-amber-300 ring-2 ring-amber-400'
                            : 'bg-amber-500/15 text-amber-300 border border-amber-400/80 font-black hover:bg-amber-500/25';
                        } else if (isSelected) {
                          btnClass += 'bg-red-500 text-white font-black border border-red-400';
                        } else {
                          btnClass += 'bg-white/5 hover:bg-white/10 text-white/70 border border-white/5';
                        }

                        return (
                          <button
                            key={num}
                            type="button"
                            onClick={() => handleQuickPreset(loser.id, num)}
                            className={btnClass}
                          >
                            {num}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-white/10 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">Người thắng nhận:</span>
            <span className="font-bold text-emerald-400 font-mono text-base">
              🏆 {winnerName}: +{totalWon} lá
            </span>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || totalWon <= 0}
            className={`w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg ${
              isSubmitting || totalWon <= 0
                ? 'bg-white/10 text-white/30 cursor-not-allowed'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20 active:scale-[0.99]'
            }`}
          >
            {isSubmitting ? (
              <span>Đang lưu ván đấu...</span>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Xác nhận & Lưu ván</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
