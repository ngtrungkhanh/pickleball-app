'use client';

import React from 'react';
import { PlayerScoreDetail } from '@/lib/loc-game/types';
import { Trophy, Flame, AlertTriangle, ArrowRight } from 'lucide-react';

interface LocRoundOverModalProps {
  scoreboard: Record<string, PlayerScoreDetail>;
  isHost: boolean;
  onNextRound?: () => void;
  onEndRoundToWaiting?: () => void;
  onLeaveRoom?: () => void;
}

export const LocRoundOverModal: React.FC<LocRoundOverModalProps> = ({
  scoreboard,
  isHost,
  onNextRound,
  onEndRoundToWaiting,
  onLeaveRoom,
}) => {
  const scores = Object.values(scoreboard).sort((a, b) => b.netCards - a.netCards);
  const winner = scores.find((s) => s.isWinner);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md select-none animate-fadeIn">
      <div className="w-full max-w-sm sm:max-w-md max-h-[92vh] overflow-y-auto p-4 sm:p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col items-center">
        {/* Biểu tượng chiến thắng */}
        <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center shadow-lg -mt-10 mb-2 border-4 border-slate-900">
          <Trophy className="w-7 h-7 text-slate-950" />
        </div>

        <h2 className="text-xl font-extrabold text-amber-400">KẾT THÚC VÁN ĐẤU</h2>
        <p className="text-xs text-slate-400 mb-4">
          Người về nhất: <strong className="text-slate-100">{winner?.playerName}</strong>
        </p>

        {/* Bảng chi tiết từng người */}
        <div className="w-full flex flex-col gap-2 mb-5">
          {scores.map((score, index) => {
            const isPlus = score.netCards > 0;
            const isZero = score.netCards === 0;

            return (
              <div
                key={score.playerId}
                className={`p-3 rounded-2xl border flex items-center justify-between ${
                  score.isWinner
                    ? 'bg-amber-950/30 border-amber-500/40 ring-1 ring-amber-400/30'
                    : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      index === 0
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm text-slate-100 flex items-center gap-1">
                      {score.playerName}
                      {score.isWinner && (
                        <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.2 rounded font-semibold border border-amber-500/30">
                          Nhất
                        </span>
                      )}
                    </span>
                    {/* Các tag chi tiết phạt */}
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 flex-wrap mt-0.5">
                      {score.isBurned && (
                        <span className="text-rose-400 font-semibold flex items-center gap-0.5">
                          <Flame className="w-2.5 h-2.5 fill-rose-400" /> Cóng (14 lá)
                        </span>
                      )}
                      {score.twosRemaining > 0 && (
                        <span className="text-orange-400">
                          Thối {score.twosRemaining} con 2 (-{score.twosRemaining * 5})
                        </span>
                      )}
                      {score.hasThoi2ByEndingWith2 && (
                        <span className="text-rose-400 flex items-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5" /> Về bằng 2 (-5)
                        </span>
                      )}
                      {score.chopPoints !== 0 && (
                        <span className={score.chopPoints > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          Chặt 2 ({score.chopPoints > 0 ? `+${score.chopPoints}` : score.chopPoints})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Điểm lá thực nhận */}
                <div className="text-right">
                  <span
                    className={`font-mono text-base font-extrabold ${
                      isPlus
                        ? 'text-emerald-400'
                        : isZero
                        ? 'text-slate-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {isPlus ? `+${score.netCards}` : score.netCards} lá
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Cụm nút hành động */}
        <div className="w-full flex flex-col gap-2">
          {onNextRound && (
            <button
              type="button"
              onClick={onNextRound}
              className="w-full py-2.5 sm:py-3 rounded-2xl font-black text-xs sm:text-sm bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg hover:brightness-110 active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
              <span>{isHost ? 'Ván tiếp theo (Chủ phòng)' : 'Sẵn sàng ván tiếp theo'}</span>
            </button>
          )}

          {onEndRoundToWaiting && (
            <button
              type="button"
              onClick={onEndRoundToWaiting}
              className="w-full py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Kết thúc ván (Không đánh tiếp, về bàn chờ)</span>
            </button>
          )}

          {onLeaveRoom && (
            <button
              type="button"
              onClick={onLeaveRoom}
              className="w-full py-2 rounded-xl font-semibold text-xs text-rose-400 hover:text-white hover:bg-rose-600/30 border border-rose-500/30 active:scale-95 transition flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>Rời phòng</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
