'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardCombo } from '@/lib/loc-game/types';
import { LocCard } from './LocCard';
import { getSmartHint } from '@/lib/loc-game/smart-hint';
import { sortCards } from '@/lib/loc-game/deck';

interface LocHandProps {
  hand: Card[];
  tableCombo: CardCombo | null;
  isMyTurn: boolean;
  selectedCardIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  disabled?: boolean;
  playerName?: string;
  dimHintCardIds?: string[]; // Lá tự động gợi ý khi tới lượt
  isUrgentHint?: boolean;    // Sau 10s chưa đánh thì sáng rõ hơn
  turnSecondsLeft?: number | null; // Đếm ngược 30s
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
  isUrgentHint = false,
  turnSecondsLeft = null,
}) => {
  const [highlightedCardIds, setHighlightedCardIds] = useState<string[]>([]);
  const sortedHand = useMemo(() => sortCards(hand), [hand]);

  const selectedSet = useMemo(() => new Set(selectedCardIds), [selectedCardIds]);
  const highlightedSet = useMemo(() => new Set(highlightedCardIds), [highlightedCardIds]);
  const dimHintSet = useMemo(() => new Set(dimHintCardIds), [dimHintCardIds]);

  const isOneCardLeft = hand.length === 1;

  // Xử lý khi click vào lá bài
  const handleCardClick = (card: Card) => {
    if (disabled) return;

    const isAlreadySelected = selectedSet.has(card.id);

    if (isAlreadySelected) {
      // Bỏ chọn lá này
      const newSelected = selectedCardIds.filter((id) => id !== card.id);
      onSelectionChange(newSelected);

      // Nếu còn đúng 1 lá đang chọn, tính lại gợi ý cho lá đó
      if (newSelected.length === 1) {
        const remainingCard = hand.find((c) => c.id === newSelected[0]);
        if (remainingCard) {
          const hints = getSmartHint(remainingCard, hand, tableCombo);
          setHighlightedCardIds(hints.map((c) => c.id));
        }
      } else if (newSelected.length === 0) {
        setHighlightedCardIds([]);
      }
    } else {
      // Chọn lá bài này
      const newSelected = [...selectedCardIds, card.id];
      onSelectionChange(newSelected);

      // Gợi ý bài thông minh theo yêu cầu
      const hints = getSmartHint(card, hand, tableCombo);
      setHighlightedCardIds(hints.map((c) => c.id));
    }
  };

  // Nút Sắp Xếp
  const handleSortClick = () => {
    onSelectionChange([]);
    setHighlightedCardIds([]);
  };

  return (
    <div className="w-full flex items-end justify-between px-1 sm:px-4 pb-1 select-none relative z-20">
      {/* 1. KHUNG AVATAR CỦA BẠN ("You" - Góc dưới trái) */}
      <div
        className={`relative flex flex-col items-center justify-between w-9 sm:w-14 md:w-18 p-0.5 sm:p-1 rounded-xl bg-black/80 border border-white/10 transition-all duration-200 shadow-xl shrink-0 ${
          isMyTurn
            ? 'ring-2 sm:ring-4 ring-emerald-500 border-emerald-400 shadow-[0_0_15px_rgba(34,197,94,0.6)]'
            : ''
        }`}
      >
        <div className="w-full text-center px-0.5">
          <span className="text-[9px] sm:text-xs font-bold text-white truncate block">
            {playerName}
          </span>
        </div>

        {/* Bộ đếm 30s khi tới lượt của bạn */}
        {isMyTurn && turnSecondsLeft !== null && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30">
            <div
              className={`px-1.5 sm:px-2 py-0.5 rounded-full font-black text-[9px] sm:text-xs font-mono shadow-lg border flex items-center gap-1 ${
                turnSecondsLeft <= 5
                  ? 'bg-red-600 text-white border-white animate-bounce'
                  : 'bg-emerald-500 text-slate-950 border-emerald-300'
              }`}
            >
              ⏱️{turnSecondsLeft}s
            </div>
          </div>
        )}

        {/* Chibi Avatar Bạn gái kính râm/kính cận */}
        <div className="relative w-7 h-7 sm:w-11 sm:h-11 md:w-13 md:h-13 my-0.5 flex items-center justify-center">
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

          {/* CHỮ "BÁO 1" 3D NỔI BẬT NẾU BẠN CÒN 1 LÁ */}
          {isOneCardLeft && (
            <div className="absolute -inset-1 flex items-center justify-center z-20 pointer-events-none">
              <div
                className="text-center font-black text-[9px] sm:text-xs tracking-wider uppercase px-1.5 py-0.5 rounded bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 text-amber-950 border border-white shadow-[0_4px_12px_rgba(234,179,8,0.9)] animate-bounce"
                style={{
                  textShadow: '0 1px 2px rgba(255,255,255,0.8), 0 -1px 1px rgba(0,0,0,0.4)',
                }}
              >
                BÁO 1
              </div>
            </div>
          )}
        </div>

        {/* Xu vàng */}
        <div className="w-full flex items-center justify-center gap-0.5 sm:gap-1 bg-black/50 rounded py-0.5">
          <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-tr from-amber-600 to-yellow-300 border border-yellow-200 flex items-center justify-center text-[7px] sm:text-[8px] font-black text-amber-950 shadow-xs">
            €
          </span>
          <span className="text-[9px] sm:text-[11px] font-bold text-amber-300 font-mono">
            {hand.length * 25}
          </span>
        </div>
      </div>

      {/* 2. DÃY LÁ BÀI TRÊN TAY: KHÔNG ĐÈ NHAU, TỰ ĐỘNG THU PHÓNG THEO MÀN HÌNH */}
      <div className="flex-1 flex justify-center items-end px-0.5 sm:px-2 max-w-[calc(100vw-90px)] sm:max-w-2xl overflow-visible">
        <div className="flex items-end justify-center gap-[clamp(1px,0.4vw,5px)] max-w-full">
          {sortedHand.map((card) => {
            const isSelected = selectedSet.has(card.id);
            const isHighlighted = highlightedSet.has(card.id) || (isUrgentHint && dimHintSet.has(card.id));
            const isDimHint = !isSelected && !isHighlighted && dimHintSet.has(card.id) && selectedSet.size === 0;

            return (
              <div
                key={card.id}
                className="transition-transform duration-150 shrink-0"
                style={{ zIndex: isSelected ? 40 : 10 }}
              >
                <LocCard
                  card={card}
                  isSelected={isSelected}
                  isHighlighted={isHighlighted}
                  isDimHint={isDimHint}
                  disabled={disabled}
                  size="md"
                  onClick={() => handleCardClick(card)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. NÚT "SẮP XẾP" (Góc dưới phải) */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={handleSortClick}
          className="px-1.5 sm:px-3 py-1 sm:py-2 rounded-lg sm:rounded-xl font-black text-[10px] sm:text-xs md:text-sm text-white bg-gradient-to-r from-sky-400 to-cyan-500 hover:from-sky-300 hover:to-cyan-400 active:scale-95 transition shadow-[0_4px_12px_rgba(14,165,233,0.5)] border border-white/20 select-none cursor-pointer"
        >
          Sắp Xếp
        </button>
      </div>
    </div>
  );
};
