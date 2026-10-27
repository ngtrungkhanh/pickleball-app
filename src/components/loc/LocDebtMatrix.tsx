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
        <div className="space-y-2">
          <div className="overflow-x-auto pb-1">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="p-2 text-left text-[11px] font-bold text-white/40 uppercase tracking-wider border-b border-white/10">
                    Nợ ➔ Được
                  </th>
                  {players.map(colPlayer => (
                    <th
                      key={colPlayer.id}
                      className={`p-2 text-center border-b border-white/10 transition-colors ${
                        highlightedPlayerId === colPlayer.id
                          ? 'bg-amber-500/20 text-amber-300 font-black'
                          : 'text-white/70 font-bold'
                      }`}
                      title={colPlayer.name}
                    >
                      <div className="w-6 h-6 mx-auto rounded-full bg-white/10 flex items-center justify-center font-bold text-[11px]">
                        {colPlayer.name.charAt(0).toUpperCase()}
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
                        <span className="truncate">{rowPlayer.name}</span>
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
          <div className="flex items-center justify-between text-[11px] text-white/40 pt-1 border-t border-white/5">
            <span>* Hàng dọc nợ Cột ngang</span>
            <span>Chạm hàng để soi quan hệ</span>
          </div>
        </div>
      ) : (
        /* Danh sách thẻ nợ */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {directList.map((item, idx) => (
            <div
              key={`${item.fromId}-${item.toId}-${idx}`}
              className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/5"
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white/90">{item.fromName}</span>
                <ArrowRight className="w-3.5 h-3.5 text-white/30" />
                <span className="font-bold text-sm text-emerald-400">{item.toName}</span>
              </div>
              <div className="flex items-center gap-1 font-mono font-black text-red-400 text-sm">
                <span>{item.cards}</span>
                <span className="text-[11px] text-white/40 font-normal">lá</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
