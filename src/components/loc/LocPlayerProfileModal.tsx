'use client';

import React from 'react';
import { PlayerSessionStats } from '@/lib/loc-core';
import { X, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

interface LocPlayerProfileModalProps {
  playerStats: PlayerSessionStats | null;
  onClose: () => void;
}

export function LocPlayerProfileModal({
  playerStats,
  onClose,
}: LocPlayerProfileModalProps) {
  if (!playerStats) return null;

  const isNetPositive = playerStats.netCards > 0;
  const isNetZero = playerStats.netCards === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-slate-950 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-300 font-black text-base flex items-center justify-center border border-amber-500/30">
              {playerStats.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{playerStats.name}</h3>
              <p className="text-xs text-white/50">Hồ sơ buổi chơi</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/50 hover:text-white rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Hero stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
              <span className="text-[11px] font-semibold text-white/50 block">Tổng lá ròng</span>
              <span
                className={`text-lg font-mono font-black mt-0.5 block ${
                  isNetPositive
                    ? 'text-emerald-400'
                    : isNetZero
                    ? 'text-white/60'
                    : 'text-red-400'
                }`}
              >
                {isNetPositive ? `+${playerStats.netCards}` : playerStats.netCards}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
              <span className="text-[11px] font-semibold text-white/50 block">Thắng / Đã chơi</span>
              <span className="text-lg font-mono font-black text-white mt-0.5 block">
                {playerStats.wins} / {playerStats.totalRounds}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
              <span className="text-[11px] font-semibold text-white/50 block">Tỉ lệ nhất</span>
              <span className="text-lg font-mono font-black text-amber-400 mt-0.5 block">
                {playerStats.winRate}%
              </span>
            </div>
          </div>

          {/* Khoản mình đang nợ người khác */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-red-400">
              <ArrowUpRight className="w-4 h-4" />
              <span>Đang nợ người khác ({playerStats.owes.length})</span>
            </div>

            {playerStats.owes.length === 0 ? (
              <p className="text-xs text-white/40 italic p-2.5 rounded-lg bg-white/[0.02]">
                Không nợ ai lá nào! 🎉
              </p>
            ) : (
              <div className="space-y-1.5">
                {playerStats.owes.map(item => (
                  <div
                    key={item.toId}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-red-500/10 border border-red-500/20"
                  >
                    <span className="text-sm font-semibold text-white/90">
                      Nợ <strong className="text-white font-bold">{item.toName}</strong>
                    </span>
                    <span className="font-mono font-black text-red-400 text-sm">
                      {item.cards} lá
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Người khác đang nợ mình */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <ArrowDownLeft className="w-4 h-4" />
              <span>Người khác đang nợ ({playerStats.owedBy.length})</span>
            </div>

            {playerStats.owedBy.length === 0 ? (
              <p className="text-xs text-white/40 italic p-2.5 rounded-lg bg-white/[0.02]">
                Chưa ai nợ bạn lá nào
              </p>
            ) : (
              <div className="space-y-1.5">
                {playerStats.owedBy.map(item => (
                  <div
                    key={item.fromId}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                  >
                    <span className="text-sm font-semibold text-white/90">
                      <strong className="text-white font-bold">{item.fromName}</strong> nợ
                    </span>
                    <span className="font-mono font-black text-emerald-400 text-sm">
                      +{item.cards} lá
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-950 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
