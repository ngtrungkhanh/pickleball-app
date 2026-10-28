'use client';

import React, { useState } from 'react';
import { LocPlayer, PairwiseDebt } from '@/lib/loc-core';
import { ArrowRight, LayoutGrid, List } from 'lucide-react';

interface LocDebtMatrixProps {
  players: LocPlayer[];
  matrix: Record<string, Record<string, number>>;
  directList: PairwiseDebt[];
}

export function LocDebtMatrix({ players, matrix, directList }: LocDebtMatrixProps) {
  const [viewMode, setViewMode] = useState<'matrix' | 'list'>('matrix');
  const [highlightedPlayerId, setHighlightedPlayerId] = useState<string | null>(null);

  const exampleDebt = directList.find(d => d.cards > 0);

  return (
    <div className="rounded-2xl bg-slate-900/90 border border-white/10 p-3.5 space-y-3">
      {/* Title & View Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <h3 className="text-sm font-bold text-white tracking-wide">
            Sổ nợ đối kháng (Ai nợ ai)
          </h3>
        </div>

        <div className="flex items-center rounded-lg bg-black/40 border border-white/10 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('matrix')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
              viewMode === 'matrix'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-white/40 hover:text-white/80'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Ma trận</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
              viewMode === 'list'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-white/40 hover:text-white/80'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Danh sách</span>
          </button>
        </div>
      </div>

      {directList.length === 0 ? (
        <div className="py-6 text-center text-xs text-white/40 italic">
          Chưa có ván đấu nào hoặc điểm nợ đang bằng 0
        </div>
      ) : viewMode === 'matrix' ? (
        <div className="space-y-3">
          <div className="overflow-x-auto pb-1 -mx-1 px-1">
            <table className="w-full min-w-[320px] text-xs border-collapse">
              <thead>
                <tr>
                  <th className="p-2 text-left border-b border-white/10 min-w-[85px]">
                    <div className="text-[10px] font-black text-amber-400 uppercase tracking-wider leading-tight">
                      Hàng nợ ↓ \ Cột nhận →
                    </div>
                  </th>
                  {players.map(colPlayer => (
                    <th
                      key={colPlayer.id}
                      className={`p-2 text-center border-b border-white/10 transition-colors ${
                        highlightedPlayerId === colPlayer.id
                          ? 'bg-amber-500/20 text-amber-300 font-black'
                          : 'text-white/80 font-bold'
                      }`}
                      title={colPlayer.name}
                    >
                      <div className="text-center min-w-[55px]">
                        <span className="text-xs font-bold text-emerald-400 block truncate max-w-[80px] mx-auto leading-tight">
                          {colPlayer.name}
                        </span>
                        <span className="text-[9px] text-white/40 block font-normal mt-0.5">
                          (Nhận)
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map(rowPlayer => {
                  const isHighlighted = highlightedPlayerId === rowPlayer.id;
                  return (
                    <tr
                      key={rowPlayer.id}
                      onClick={() =>
                        setHighlightedPlayerId(
                          highlightedPlayerId === rowPlayer.id ? null : rowPlayer.id
                        )
                      }
                      className={`cursor-pointer transition-colors ${
                        isHighlighted ? 'bg-white/[0.06]' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      {/* Tên người nợ (hàng dọc) */}
                      <td className="p-2 text-left font-bold text-white/90 border-b border-white/5 truncate max-w-[100px]">
                        <span className="text-xs font-bold text-white/90 truncate block leading-tight">
                          {rowPlayer.name}
                        </span>
                        <span className="text-[9px] text-red-400/60 block font-normal mt-0.5">
                          (Nợ)
                        </span>
                      </td>

                      {/* Các ô số lá nợ */}
                      {players.map(colPlayer => {
                        if (rowPlayer.id === colPlayer.id) {
                          return (
                            <td
                              key={colPlayer.id}
                              className="p-2 text-center text-white/20 border-b border-white/5 font-mono"
                            >
                              -
                            </td>
                          );
                        }

                        const owes = matrix[rowPlayer.id]?.[colPlayer.id] || 0;
                        const cellHighlight =
                          isHighlighted || highlightedPlayerId === colPlayer.id;

                        return (
                          <td
                            key={colPlayer.id}
                            className={`p-2 text-center border-b border-white/5 font-mono font-bold transition-colors ${
                              cellHighlight ? 'bg-white/[0.03]' : ''
                            }`}
                          >
                            {owes > 0 ? (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 text-[11px] font-black border border-red-500/30">
                                {owes}
                              </span>
                            ) : (
                              <span className="text-white/20">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Hướng dẫn & Ví dụ thực tế rõ ràng */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-amber-300 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Quy ước ma trận: HÀNG DỌC (trái) NỢ CỘT NGANG (trên)</span>
            </div>
            <p className="text-white/80 text-[11px] leading-relaxed">
              {exampleDebt ? (
                <>
                  👉 <strong>Ví dụ thực tế:</strong> Hàng <strong>{exampleDebt.fromName}</strong> gióng sang cột <strong>{exampleDebt.toName}</strong> có số <strong>{exampleDebt.cards}</strong> ➔ nghĩa là <strong>{exampleDebt.fromName} nợ {exampleDebt.toName} {exampleDebt.cards} lá</strong>.
                </>
              ) : (
                <>
                  👉 <strong>Ví dụ:</strong> Gióng từ người ở hàng bên trái sang cột người bên trên có số <strong>2</strong> ➔ nghĩa là <strong>Người hàng trái nợ Người cột trên 2 lá</strong>.
                </>
              )}
            </p>
          </div>
        </div>
      ) : (
        /* Danh sách thẻ nợ */
        <div className="space-y-1.5">
          {directList.map((item, idx) => (
            <div
              key={`${item.fromId}-${item.toId}-${idx}`}
              className="grid grid-cols-[1fr_24px_1fr_60px] items-center px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-xs sm:text-sm"
            >
              <span className="font-bold text-white/90 text-right truncate pr-1">
                {item.fromName}
              </span>
              <div className="flex items-center justify-center text-white/30">
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-emerald-400 text-left truncate pl-1">
                {item.toName}
              </span>
              <div className="flex items-center justify-end gap-1 font-mono font-black text-red-400 text-right">
                <span>{item.cards}</span>
                <span className="text-[10px] text-white/40 font-normal">lá</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
