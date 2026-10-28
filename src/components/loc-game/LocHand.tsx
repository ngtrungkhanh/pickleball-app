'use client';

import React, { useMemo } from 'react';
import { Card, CardCombo, PlayerScoreDetail } from '@/lib/loc-game/types';
import { LocCard } from './LocCard';
import { getBotHintForSelection } from '@/lib/loc-game/bot';
import { sortCards } from '@/lib/loc-game/deck';
import { Trophy, Flame, AlertTriangle } from 'lucide-react';

interface LocHandProps {
  hand: Card[];
  tableCombo: CardCombo | null;
  isMyTurn: boolean;
  selectedCardIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  disabled?: boolean;
  playerName?: string;
  dimHintCardIds?: string[];
  isAiHintEnabled?: boolean;
  turnSecondsLeft?: number | null;
  hasPassed?: boolean;
  isNextTurn?: boolean;
  isRoundEnded?: boolean;
  scoreDetail?: PlayerScoreDetail | null;
}

export const LocHand: React.FC<LocHandProps> = ({
  hand,
  tableCombo,
  isMyTurn,
  selectedCardIds,
  onSelectionChange,
  disabled = false,
  playerName = 'You',
  dimHintCardIds = [],
  isAiHintEnabled = true,
  turnSecondsLeft = null,
  hasPassed = false,
  isNextTurn = false,
  isRoundEnded = false,
  scoreDetail = null,
}) => {
  const isWinner = Boolean(scoreDetail?.isWinner);
  const sortedHand = useMemo(() => sortCards(hand), [hand]);

  const selectedSet = useMemo(() => new Set(selectedCardIds), [selectedCardIds]);
  const dimHintSet = useMemo(() => new Set(dimHintCardIds), [dimHintCardIds]);

  const selectedCards = useMemo(() => {
    return hand.filter((c) => selectedSet.has(c.id));
  }, [hand, selectedSet]);

  // GỢI Ý THÔNG MINH DỰA TRÊN TỔ HỢP LÁ ĐÃ CHỌN BẰNG BOT AI
  // Khi chọn 1 hay nhiều cây, bot đưa ra gợi ý theo tổ hợp đã chọn. Nếu chọn sai lá -> không sáng lá nào.
  const selectionHintCards = useMemo(() => {
    if (!isAiHintEnabled || selectedCards.length === 0) return [];
    return getBotHintForSelection(selectedCards, hand, tableCombo);
  }, [isAiHintEnabled, selectedCards, hand, tableCombo]);

  const selectionHintSet = useMemo(
    () => new Set(selectionHintCards.map((c) => c.id)),
    [selectionHintCards]
  );

  const isOneCardLeft = hand.length === 1;

  // Xử lý khi click vào lá bài
  const handleCardClick = (card: Card) => {
    if (disabled) return;

    const isAlreadySelected = selectedSet.has(card.id);

    if (isAlreadySelected) {
      const newSelected = selectedCardIds.filter((id) => id !== card.id);
      onSelectionChange(newSelected);
    } else {
      const newSelected = [...selectedCardIds, card.id];
      onSelectionChange(newSelected);
    }
  };

  // Nút Sắp Xếp
  const handleSortClick = () => {
    onSelectionChange([]);
  };

  return (
    <div className="w-full flex items-end justify-between px-2 sm:px-6 select-none relative z-20">
      {/* 1. KHUNG AVATAR CỦA BẠN ("You" - Góc dưới trái chuẩn ZingPlay) */}
      <div
        className={`relative flex flex-col items-center justify-between w-12 sm:w-16 md:w-20 p-1 sm:p-1.5 rounded-xl transition-all duration-200 shadow-xl shrink-0 ${
          isWinner
            ? 'bg-amber-950/90 ring-3 ring-amber-400 border-amber-300 shadow-[0_0_25px_rgba(251,191,36,0.8)]'
            : isMyTurn && !isRoundEnded
            ? 'bg-black/85 ring-3 sm:ring-4 ring-emerald-400 border-emerald-300 shadow-[0_0_25px_rgba(52,211,153,0.7),inset_0_0_15px_rgba(52,211,153,0.2)] animate-pulse'
            : hasPassed && !isRoundEnded
            ? 'bg-slate-900/90 border border-slate-700/80 grayscale opacity-60 contrast-90 shadow-none'
            : isNextTurn && !isRoundEnded
            ? 'bg-black/80 border border-sky-400/60 shadow-[0_0_15px_rgba(56,189,248,0.35)]'
            : 'bg-black/80 border border-white/10'
        }`}
      >
        <div className="w-full text-center px-0.5">
          <span className="text-[10px] sm:text-xs font-bold text-white truncate block">
            {playerName}
          </span>
        </div>

        {/* Bộ đếm 30s khi tới lượt của bạn (nếu chưa tích hợp ở giữa) */}
        {isMyTurn && turnSecondsLeft !== null && !isRoundEnded && (
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
            <div
              className={`px-1.5 sm:px-2 py-0.5 rounded-full font-black text-[10px] sm:text-xs font-mono shadow-xl border flex items-center gap-1 ${
                turnSecondsLeft <= 5
                  ? 'bg-red-600 text-white border-white animate-bounce shadow-[0_0_12px_rgba(239,68,68,0.8)]'
                  : 'bg-emerald-500 text-slate-950 border-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.8)]'
              }`}
            >
              ⏱️ {turnSecondsLeft}s
            </div>
          </div>
        )}

        {/* Chibi Avatar Bạn gái kính râm/kính cận */}
        <div className="loc-self-portrait relative w-9 h-9 sm:w-12 sm:h-12 md:w-14 md:h-14 my-0.5 flex items-center justify-center">
          {/* Vòng hào quang sáng khi đang chơi */}
          {isMyTurn && !isRoundEnded && (
            <div className="absolute inset-0 rounded-full bg-emerald-400/25 blur-sm animate-pulse pointer-events-none" />
          )}
          {isWinner && (
            <div className="absolute inset-0 rounded-full bg-amber-400/30 blur-sm animate-pulse pointer-events-none" />
          )}

          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow">
            <path d="M 20 100 C 20 70 80 70 80 100 Z" fill="#f43f5e" />
            <polygon points="40,80 50,92 60,80 50,75" fill="#ffffff" />
            <circle cx="50" cy="50" r="28" fill="#fed7aa" />
            <path
              d="M 20 50 C 18 20 82 20 80 50 C 85 65 75 75 65 70 C 60 40 40 40 35 70 C 25 75 15 65 20 50 Z"
              fill="#eab308"
            />
            <g stroke="#18181b" strokeWidth="2.5" fill="none">
              <rect x="33" y="44" width="14" height="11" rx="3" fill="rgba(255,255,255,0.4)" />
              <rect x="53" y="44" width="14" height="11" rx="3" fill="rgba(255,255,255,0.4)" />
              <line x1="47" y1="49" x2="53" y2="49" />
            </g>
            <circle cx="40" cy="49" r="2.5" fill="#18181b" />
            <circle cx="60" cy="49" r="2.5" fill="#18181b" />
            <path d="M 45 61 Q 50 66 55 61" stroke="#e11d48" strokeWidth="2" fill="none" />
          </svg>

          {/* HUY HIỆU NGƯỜI THẮNG CUỘC KHI KẾT THÚC VÁN */}
          {isRoundEnded && isWinner && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none whitespace-nowrap">
              <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[11px] font-black uppercase tracking-tight bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-950 border border-white shadow-[0_2px_10px_rgba(251,191,36,0.9)] flex items-center gap-1 animate-bounce">
                <Trophy className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-amber-950" />
                {scoreDetail?.isSamSuccess ? 'Ăn Sâm' : 'Về Nhất'}
              </span>
            </div>
          )}

          {/* CHỮ "BÁO 1" 3D NỔI BẬT NẾU BẠN CÒN 1 LÁ */}
          {!isRoundEnded && isOneCardLeft && (
            <div className="absolute -inset-1 flex items-center justify-center z-20 pointer-events-none">
              <div
                className="text-center font-black text-[10px] sm:text-xs md:text-sm tracking-wider uppercase px-1 sm:px-2 py-0.5 rounded bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 text-amber-950 border-2 border-white shadow-[0_4px_12px_rgba(234,179,8,0.9)] animate-bounce"
                style={{
                  textShadow: '0 1px 2px rgba(255,255,255,0.8), 0 -1px 1px rgba(0,0,0,0.4)',
                }}
              >
                BÁO 1
              </div>
            </div>
          )}

          {/* CHỮ "QUA LƯỢT" Ở GÓC DƯỚI ICON KHI BỎ LƯỢT */}
          {!isRoundEnded && hasPassed && (
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 z-20 pointer-events-none whitespace-nowrap">
              <span className="px-1 sm:px-1.5 py-0.2 rounded-full text-[8px] sm:text-[9px] md:text-[10px] font-black uppercase tracking-tight bg-slate-800/95 text-slate-300 border border-slate-500 shadow-md">
                Qua lượt
              </span>
            </div>
          )}

          {/* CHỮ "CHUẨN BỊ" Ở GÓC DƯỚI ICON KHI CHUẨN BỊ ĐÁNH */}
          {!isRoundEnded && isNextTurn && !isMyTurn && !hasPassed && (
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 z-20 pointer-events-none whitespace-nowrap">
              <span className="px-1 sm:px-1.5 py-0.2 rounded-full text-[8px] sm:text-[9px] md:text-[10px] font-black uppercase tracking-tight bg-gradient-to-r from-sky-500 to-blue-600 text-white border border-sky-300 shadow-[0_2px_8px_rgba(14,165,233,0.6)] animate-pulse">
                Chuẩn bị
              </span>
            </div>
          )}
        </div>

        {/* Số lá thực nhận / phạt khi kết thúc ván, hoặc số tiền xu vàng khi đang chơi */}
        {isRoundEnded && scoreDetail ? (
          <div className="w-full flex flex-col items-center justify-center gap-0.5 rounded py-0.5 bg-black/60 border border-white/10">
            <span
              className={`text-[10px] sm:text-[11px] font-black font-mono leading-none ${
                scoreDetail.netCards > 0
                  ? 'text-emerald-300'
                  : scoreDetail.netCards === 0
                  ? 'text-slate-300'
                  : 'text-rose-400'
              }`}
            >
              {scoreDetail.netCards > 0 ? `+${scoreDetail.netCards}` : scoreDetail.netCards} lá
            </span>
            {scoreDetail.isBurned && (
              <span className="text-[8px] font-bold text-rose-300 flex items-center leading-none">
                <Flame className="w-2 h-2 fill-rose-400" /> Cóng
              </span>
            )}
            {scoreDetail.twosRemaining > 0 && (
              <span className="text-[8px] font-bold text-orange-300 leading-none">
                Thối {scoreDetail.twosRemaining} heo
              </span>
            )}
            {scoreDetail.isDenLang && (
              <span className="text-[8px] font-bold text-rose-400 flex items-center leading-none">
                <AlertTriangle className="w-2 h-2" /> Đền làng
              </span>
            )}
            {scoreDetail.isSamFailed && (
              <span className="text-[8px] font-bold text-rose-400 leading-none">
                Đền sâm
              </span>
            )}
          </div>
        ) : (
          <div className="w-full flex items-center justify-center gap-1 bg-black/50 rounded py-0.5">
            <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-tr from-amber-600 to-yellow-300 border border-yellow-200 flex items-center justify-center text-[7px] sm:text-[8px] font-black text-amber-950 shadow-xs">
              €
            </span>
            <span className="text-[10px] sm:text-[11px] font-bold text-amber-300 font-mono">
              {hand.length * 25}
            </span>
          </div>
        )}
      </div>

      {/* 2. DÃY LÁ BÀI TRÊN TAY: XẾP XÒE GỐI ĐÈ NHAU CHUẨN ZINGPLAY */}
      <div className="min-w-0 flex-1 flex justify-center items-end px-2 sm:px-4 overflow-visible">
        <div
          className="grid items-end select-none w-full"
          style={{
            maxWidth: `calc(var(--loc-hand-card-width) * ${1 + Math.max(0, hand.length - 1) * 0.55})`,
            gridTemplateColumns: `${hand.length > 1 ? `repeat(${hand.length - 1}, minmax(0, 1fr)) ` : ''}var(--loc-hand-card-width)`,
          }}
        >
          {sortedHand.map((card, index) => {
            const isSelected = selectedSet.has(card.id);
            // Sáng nổi bật khi là lá được gợi ý theo tổ hợp đang chọn
            const isHighlighted = isAiHintEnabled && selectionHintSet.has(card.id);
            // Sáng nhô nhẹ khi tới lượt (chưa chọn lá nào)
            const isDimHint =
              isAiHintEnabled && !isSelected && !isHighlighted && dimHintSet.has(card.id) && selectedSet.size === 0;

            return (
              <div
                key={card.id}
                className="transition-all duration-150 min-w-0"
                style={{
                  zIndex: 10 + index,
                }}
              >
                <LocCard
                  card={card}
                  isSelected={isSelected}
                  isHighlighted={isHighlighted}
                  isDimHint={isDimHint}
                  disabled={disabled}
                  size="xl"
                  className="loc-hand-card"
                  onClick={() => handleCardClick(card)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. NÚT "SẮP XẾP" */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={handleSortClick}
          className="px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-black text-xs sm:text-sm text-white bg-gradient-to-r from-sky-400 to-cyan-500 hover:from-sky-300 hover:to-cyan-400 active:scale-95 transition shadow-[0_4px_15px_rgba(14,165,233,0.6)] border border-white/20 select-none cursor-pointer"
        >
          Sắp Xếp
        </button>
      </div>
    </div>
  );
};
