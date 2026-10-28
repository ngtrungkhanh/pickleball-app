'use client';

import React, { useState, useMemo } from 'react';
import { TableState } from '@/lib/loc-game/network-types';
import { calculatePairwiseDebts, getShortNameMap, LocRound, LocPlayer } from '@/lib/loc-core';
import { X, Award, ExternalLink, Calendar } from 'lucide-react';
import Link from 'next/link';

interface LocScoreHistoryModalProps {
  tableState: TableState;
  onClose: () => void;
}

export const LocScoreHistoryModal: React.FC<LocScoreHistoryModalProps> = ({
  tableState,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'matrix' | 'rounds'>('matrix');

  const completedRounds = useMemo(() => {
    return tableState.completedRounds || [];
  }, [tableState.completedRounds]);

  // Chuẩn hóa dữ liệu sang LocPlayer và LocRound để tái sử dụng logic tính ma trận nợ
  const locPlayers: LocPlayer[] = useMemo(() => {
    return tableState.players.map((p) => ({
      id: p.id,
      name: p.name,
    }));
  }, [tableState.players]);

  const locRounds: LocRound[] = useMemo(() => {
    return completedRounds.map((r, idx) => {
      const debts: { loserId: string; cards: number }[] = [];
      for (const [pid, detail] of Object.entries(r.scores)) {
        if (pid === r.winnerId) continue;
        const lost = Math.abs(detail.netCards || 0);
        if (lost > 0) {
          debts.push({ loserId: pid, cards: lost });
        }
      }
      return {
        id: `r_${idx + 1}`,
        sessionId: tableState.roomId,
        roundNumber: r.roundNumber,
        winnerId: r.winnerId,
        debts,
        createdAt: new Date(r.timestamp).toISOString(),
      };
    });
  }, [completedRounds, tableState.roomId]);

  const shortNames = useMemo(() => getShortNameMap(locPlayers), [locPlayers]);

  const { matrix, directList } = useMemo(() => {
    return calculatePairwiseDebts(locPlayers, locRounds);
  }, [locPlayers, locRounds]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl sm:rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* HEADER */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-white">
                Sổ Nợ & Lịch Sử Ván
              </h3>
              <p className="text-[11px] text-slate-400">
                {completedRounds.length} ván đã đấu • Phòng: {tableState.roomName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* TAB SWITCHER */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('matrix')}
            className={`flex-1 py-2.5 text-xs sm:text-sm font-bold transition border-b-2 cursor-pointer ${
              activeTab === 'matrix'
                ? 'border-amber-400 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Sổ Nợ & Ma Trận
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rounds')}
            className={`flex-1 py-2.5 text-xs sm:text-sm font-bold transition border-b-2 cursor-pointer ${
              activeTab === 'rounds'
                ? 'border-amber-400 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Lịch Sử Từng Ván ({completedRounds.length})
          </button>
        </div>

        {/* NỘI DUNG CUỘN */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1 flex flex-col gap-4">
          {completedRounds.length === 0 ? (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center">
              <span className="text-4xl mb-2">🃏</span>
              <p className="text-sm font-semibold">Chưa có ván đấu nào kết thúc.</p>
              <p className="text-xs text-slate-500 mt-1">
                Sau khi kết thúc ván đầu tiên, kết quả và sổ nợ sẽ tự động xuất hiện tại đây!
              </p>
            </div>
          ) : activeTab === 'matrix' ? (
            <>
              {/* BẢNG MA TRẬN NỢ ĐỐI KHÁNG CO GIÃN 100% */}
              <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/80">
                <div className="text-[11px] text-slate-400 mb-1.5 flex items-center justify-between">
                  <span className="font-semibold text-slate-300">Ma trận đối kháng trực tiếp:</span>
                  <span className="text-[10px] text-amber-400">Hàng ngang nợ Cột dọc</span>
                </div>

                <div className="w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-900/90">
                  <table className="w-full table-fixed text-center border-collapse">
                    <thead>
                      <tr className="bg-slate-800/80 text-[10px] sm:text-xs text-slate-400 border-b border-slate-700">
                        <th className="py-1 px-1 text-left w-14 sm:w-20 font-bold truncate">Nợ \ Cho</th>
                        {locPlayers.map((p) => (
                          <th key={p.id} className="py-1 px-0.5 font-bold truncate text-slate-200">
                            {shortNames.get(p.id) || p.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="text-[11px] sm:text-xs">
                      {locPlayers.map((pRow) => (
                        <tr key={pRow.id} className="border-b border-slate-800/60 last:border-none">
                          <td className="py-1 px-1 text-left font-bold text-slate-300 bg-slate-950/50 truncate">
                            {shortNames.get(pRow.id) || pRow.name}
                          </td>
                          {locPlayers.map((pCol) => {
                            if (pRow.id === pCol.id) {
                              return (
                                <td key={pCol.id} className="py-1 px-0.5 bg-slate-800/30 text-slate-600">
                                  -
                                </td>
                              );
                            }
                            const debt = matrix[pRow.id]?.[pCol.id] || 0;
                            return (
                              <td
                                key={pCol.id}
                                className={`py-1 px-0.5 font-mono font-bold ${
                                  debt > 0
                                    ? 'text-rose-400 bg-rose-500/10'
                                    : 'text-slate-600'
                                }`}
                              >
                                {debt > 0 ? debt : '0'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* DANH SÁCH CHI TIẾT AI NỢ AI */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-300">Tổng kết công nợ trực tiếp:</span>
                {directList.length === 0 ? (
                  <p className="text-xs text-slate-400 italic bg-slate-950/40 p-2.5 rounded-xl border border-slate-800">
                    🤝 Các bên đang hòa lá, chưa ai nợ ai.
                  </p>
                ) : (
                  directList.map((d, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 sm:p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/80 text-xs"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-bold text-rose-300">{d.fromName}</span>
                        <span className="text-slate-500">nợ</span>
                        <span className="font-bold text-emerald-300">{d.toName}</span>
                      </div>
                      <span className="font-mono font-black text-rose-400 shrink-0">
                        {d.cards} lá
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            /* TAB 2: LỊCH SỬ TỪNG VÁN */
            <div className="flex flex-col gap-2">
              {[...completedRounds].reverse().map((r) => (
                <div
                  key={r.roundNumber}
                  className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-400 flex items-center gap-1">
                      <Award className="w-3.5 h-3.5" />
                      Ván {r.roundNumber}: {r.winnerName} về nhất
                    </span>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(r.timestamp).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                    {Object.values(r.scores).map((s) => (
                      <div
                        key={s.playerId}
                        className={`px-2 py-1.5 rounded-lg border text-[11px] flex items-center justify-between ${
                          s.isWinner
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                            : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        <span className="truncate max-w-[80px] font-semibold">{s.playerName}</span>
                        <span
                          className={`font-mono font-black shrink-0 ${
                            s.netCards > 0
                              ? 'text-emerald-400'
                              : s.netCards < 0
                              ? 'text-rose-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {s.netCards > 0 ? `+${s.netCards}` : s.netCards}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FOOTER & NÚT MỞ TRANG /LOC */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-2 shrink-0">
          {tableState.locSessionId ? (
            <Link
              href={`/loc?session=${tableState.locSessionId}`}
              target="_blank"
              className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition"
            >
              <span>Xem chi tiết trên Sổ Lốc</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <span className="text-[11px] text-slate-500">Đang lưu nội bộ bàn chơi</span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="py-1.5 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer ml-auto"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
