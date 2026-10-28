'use client';

import React, { useState, useEffect } from 'react';
import { RoundDebugLog } from '@/lib/loc-game/debug-types';
import { getRoomDebugLogs, exportRoomDebugLogsAsJson } from '@/lib/loc-game/debug-storage';
import { X, Download, Bug, Bot, Eye } from 'lucide-react';
import { Card } from '@/lib/loc-game/types';

interface LocDebugModalProps {
  roomId: string;
  onClose: () => void;
}

export const LocDebugModal: React.FC<LocDebugModalProps> = ({ roomId, onClose }) => {
  const [logs, setLogs] = useState<RoundDebugLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedRoundIndex, setSelectedRoundIndex] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;
    getRoomDebugLogs(roomId).then((res) => {
      if (isMounted) {
        setLogs(res);
        if (res.length > 0) {
          setSelectedRoundIndex(res.length - 1); // Mặc định mở ván gần nhất
        }
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [roomId]);

  const currentLog = logs[selectedRoundIndex] || null;

  const handleExportJson = () => {
    void exportRoomDebugLogsAsJson(roomId);
  };

  const renderCardBadge = (c: Card) => {
    const isRed = c.suit === 'hearts' || c.suit === 'diamonds';
    const rankNames: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };
    const suitSymbols = { spades: '♠', clubs: '♣', diamonds: '♦', hearts: '♥' };
    const label = `${rankNames[c.rank] || c.rank}${suitSymbols[c.suit] || ''}`;

    return (
      <span
        key={c.id}
        className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold border ${
          isRed
            ? 'bg-rose-950/60 border-rose-500/40 text-rose-300'
            : 'bg-slate-800 border-slate-700 text-slate-200'
        }`}
      >
        {label}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl sm:rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* HEADER */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
              <Bug className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-white flex items-center gap-2">
                Nhật Ký & Debug Bot AI
              </h3>
              <p className="text-[11px] text-slate-400">
                Lưu trữ tại máy Host (IndexedDB) • {logs.length} ván đấu
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportJson}
              disabled={logs.length === 0}
              className="py-1 px-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow"
              title="Tải toàn bộ file JSON về máy"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất JSON</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* NỘI DUNG */}
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            Đang tải dữ liệu nhật ký...
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center p-4">
            <Bot className="w-10 h-10 text-slate-600 mb-2" />
            <p className="text-sm font-semibold">Chưa có dữ liệu ván đấu nào.</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs text-center">
              Sau khi kết thúc ván đấu, toàn bộ lượt chia bài và suy luận của Bot AI sẽ được lưu tự động tại đây.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* THANH CHỌN VÁN */}
            <div className="px-3 py-2 bg-slate-950/40 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto shrink-0">
              <span className="text-[11px] font-bold text-slate-400 shrink-0">Chọn ván:</span>
              {logs.map((log, idx) => (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setSelectedRoundIndex(idx)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer ${
                    selectedRoundIndex === idx
                      ? 'bg-indigo-600 text-white shadow'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Ván {log.roundNumber}
                </button>
              ))}
            </div>

            {/* CHI TIẾT VÁN ĐÃ CHỌN */}
            {currentLog && (
              <div className="p-3 sm:p-4 overflow-y-auto flex-1 flex flex-col gap-3 text-xs">
                {/* 1. BÀI CHIA BAN ĐẦU */}
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-[11px] font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Bài chia ban đầu của từng người:</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {currentLog.players.map((p) => {
                      const hand = currentLog.initialHands[p.id] || [];
                      return (
                        <div key={p.id} className="flex flex-col gap-1">
                          <span className="text-[11px] font-semibold text-slate-400">
                            {p.name} {p.isBot && '🤖'}:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {hand.map((c) => renderCardBadge(c))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. DIỄN BIẾN TỪNG LƯỢT ĐÁNH & LOG BOT AI */}
                <div className="flex flex-col gap-1.5">
                  <span className="font-bold text-slate-300 text-[11px]">
                    Diễn biến từng lượt đánh ({currentLog.turns.length} nước đi):
                  </span>

                  <div className="flex flex-col gap-1.5">
                    {currentLog.turns.map((t) => (
                      <div
                        key={t.turnIndex}
                        className={`p-2 rounded-xl border ${
                          t.isBot
                            ? 'bg-indigo-950/30 border-indigo-500/30'
                            : 'bg-slate-950/40 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5 font-bold">
                            <span className="text-slate-500 text-[10px]">#{t.turnIndex}</span>
                            <span className={t.isBot ? 'text-indigo-300' : 'text-slate-200'}>
                              {t.playerName}
                            </span>
                            {t.isBot && (
                              <span className="px-1 py-0.2 bg-indigo-500/20 text-indigo-300 rounded text-[9px]">
                                Bot
                              </span>
                            )}
                          </div>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              t.action === 'PLAY'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {t.action === 'PLAY' ? 'ĐÁNH' : 'CHO QUA'}
                          </span>
                        </div>

                        {/* Các lá đánh ra nếu có */}
                        {t.action === 'PLAY' && t.cardsPlayed.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 my-1">
                            {t.cardsPlayed.map((c) => renderCardBadge(c))}
                          </div>
                        )}

                        {/* Lý do Bot AI ra quyết định */}
                        {t.botLog && t.botLog.reason && (
                          <div className="mt-1 p-1.5 rounded-lg bg-black/40 border border-indigo-500/20 text-[10px] text-amber-300 font-mono flex items-start gap-1">
                            <span className="shrink-0">💡 Lý do AI:</span>
                            <span>{t.botLog.reason}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* FOOTER */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="py-1.5 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
