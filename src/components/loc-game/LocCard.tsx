'use client';

import React from 'react';
import { Card, Suit, Rank } from '@/lib/loc-game/types';

interface LocCardProps {
  card?: Card;
  faceDown?: boolean;
  remainingCount?: number;
  isSelected?: boolean;
  isHighlighted?: boolean;
  isDimHint?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  className?: string;
}

const SUIT_ICONS: Record<Suit, { symbol: string; isRed: boolean }> = {
  spades: { symbol: '♠', isRed: false },
  clubs: { symbol: '♣', isRed: false },
  diamonds: { symbol: '♦', isRed: true },
  hearts: { symbol: '♥', isRed: true },
};

function formatRank(rank: Rank): string {
  switch (rank) {
    case 11:
      return 'J';
    case 12:
      return 'Q';
    case 13:
      return 'K';
    case 14:
      return 'A';
    case 15:
      return '2';
    default:
      return rank.toString();
  }
}

export const LocCard: React.FC<LocCardProps> = ({
  card,
  faceDown = false,
  remainingCount,
  isSelected = false,
  isHighlighted = false,
  isDimHint = false,
  disabled = false,
  size = 'md',
  onClick,
  className = '',
}) => {
  // Kích thước lá bài tối ưu: tỉ lệ 2.5 : 3.5, co giãn linh hoạt không che khuất
  const sizeClasses = {
    sm: 'w-6 sm:w-7 aspect-[2.5/3.5] rounded shadow-xs',
    md: 'w-[clamp(1.15rem,3.2vw,3rem)] aspect-[2.5/3.5] rounded-xs sm:rounded-md shadow-xs sm:shadow-sm',
    lg: 'w-10 sm:w-14 aspect-[2.5/3.5] rounded-md shadow',
  }[size];

  // 1. MẶT LƯNG BÀI: Xanh dương kẻ quả trám, vòng tròn ghi số lá còn lại
  if (faceDown || !card) {
    return (
      <div
        onClick={!disabled ? onClick : undefined}
        className={`relative select-none border border-white/80 flex items-center justify-center overflow-hidden transition-transform shadow-md ${sizeClasses} ${className}`}
        style={{
          background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 50%, #0369a1 100%)',
        }}
      >
        <div
          className="absolute inset-0.5 rounded border border-white/30 opacity-40"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.4) 4px, rgba(255,255,255,0.4) 8px),
                              repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255,255,255,0.4) 4px, rgba(255,255,255,0.4) 8px)`,
          }}
        />

        {remainingCount !== undefined && (
          <div className="relative z-10 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-sky-950/80 border border-white/90 flex items-center justify-center shadow-inner">
            <span className="font-extrabold text-white text-[9px] sm:text-[11px] drop-shadow">
              {remainingCount}
            </span>
          </div>
        )}
      </div>
    );
  }

  // 2. MẶT TRƯỚC LÁ BÀI: ĐƠN GIẢN HOÁ — CHỈ HIỆN SỐ TRÊN, CHẤT DƯỚI, MÀU ĐỎ-ĐEN TƯƠNG ỨNG
  const { rank, suit } = card;
  const suitInfo = SUIT_ICONS[suit];
  const rankLabel = formatRank(rank);
  const colorClass = suitInfo.isRed ? 'text-red-600' : 'text-slate-900';

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      className={`relative select-none cursor-pointer bg-white transition-all duration-150 flex flex-col items-center justify-center border border-slate-300 overflow-hidden ${
        isSelected
          ? '-translate-y-3 sm:-translate-y-5 shadow-2xl ring-2 sm:ring-3 ring-yellow-400 z-30 border-yellow-500'
          : isHighlighted
          ? 'ring-2 ring-yellow-400 animate-pulse shadow-lg -translate-y-1 border-yellow-400'
          : isDimHint
          ? 'ring-1.5 ring-yellow-400/70 border-yellow-400/80 shadow-md -translate-y-0.5'
          : 'hover:-translate-y-1 hover:shadow-md'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${sizeClasses} ${className}`}
      style={{
        boxShadow: isSelected
          ? '0 12px 20px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.2)'
          : '0 2px 4px rgba(0,0,0,0.25)',
      }}
    >
      {/* Khối chính giữa: Số ở trên, Chất ở dưới */}
      <div className={`flex flex-col items-center justify-center leading-none select-none ${colorClass}`}>
        <span className="font-black text-[clamp(11px,34cqw,17px)] tracking-tighter text-center">
          {rankLabel}
        </span>
        <span className="text-[clamp(10px,30cqw,16px)] leading-none mt-0.5">
          {suitInfo.symbol}
        </span>
      </div>

      {/* Chấm vàng nhỏ báo hiệu lá được gợi ý */}
      {isHighlighted && !isSelected && (
        <div className="absolute top-0.5 right-0.5 w-2 h-2 sm:w-2.5 sm:h-2.5 bg-yellow-400 rounded-full border border-white shadow-xs flex items-center justify-center">
          <span className="w-1 h-1 bg-amber-700 rounded-full animate-ping" />
        </div>
      )}
    </div>
  );
};
