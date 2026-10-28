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
  // Kích thước lá bài to rõ, chuẩn tỉ lệ 2.5 : 3.5 của ZingPlay
  const sizeClasses = {
    sm: 'w-8 sm:w-10 aspect-[2.5/3.5] rounded shadow-xs',
    md: 'w-14 sm:w-16 md:w-20 aspect-[2.5/3.5] rounded-md sm:rounded-lg shadow-md',
    lg: 'w-16 sm:w-20 aspect-[2.5/3.5] rounded-lg shadow-lg',
  }[size];

  // 1. MẶT LƯNG BÀI: Xanh dương kẻ quả trám, vòng tròn ghi số lá còn lại (Chuẩn ZingPlay)
  if (faceDown || !card) {
    return (
      <div
        onClick={!disabled ? onClick : undefined}
        className={`relative select-none border-2 border-white/90 flex items-center justify-center overflow-hidden transition-transform shadow-md ${sizeClasses} ${className}`}
        style={{
          background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 50%, #0369a1 100%)',
        }}
      >
        <div
          className="absolute inset-0.5 rounded border border-white/30 opacity-40"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.4) 5px, rgba(255,255,255,0.4) 10px),
                              repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(255,255,255,0.4) 5px, rgba(255,255,255,0.4) 10px)`,
          }}
        />

        {remainingCount !== undefined && (
          <div className="relative z-10 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-sky-950/80 border border-white/90 flex items-center justify-center shadow-inner">
            <span className="font-extrabold text-white text-[10px] sm:text-xs drop-shadow">
              {remainingCount}
            </span>
          </div>
        )}
      </div>
    );
  }

  // 2. MẶT TRƯỚC LÁ BÀI (Chuẩn 100% ZingPlay: Cột số + chất to ở góc trên trái, biểu tượng chất 3D ở giữa/dưới)
  const { rank, suit } = card;
  const suitInfo = SUIT_ICONS[suit];
  const rankLabel = formatRank(rank);
  const colorClass = suitInfo.isRed ? 'text-red-600' : 'text-slate-900';

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      className={`relative select-none cursor-pointer bg-white transition-all duration-150 flex flex-col justify-between p-1 sm:p-1.5 border border-slate-300 overflow-hidden ${
        isSelected
          ? '-translate-y-5 sm:-translate-y-7 shadow-2xl ring-3 ring-yellow-400 z-40 border-yellow-500 scale-105'
          : isHighlighted
          ? 'ring-3 ring-yellow-400 animate-pulse shadow-xl -translate-y-2 border-yellow-400'
          : isDimHint
          ? 'ring-2 ring-yellow-400/70 border-yellow-400/80 shadow-md -translate-y-1'
          : 'hover:-translate-y-1.5 hover:shadow-lg'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${sizeClasses} ${className}`}
      style={{
        boxShadow: isSelected
          ? '0 16px 28px -4px rgba(0, 0, 0, 0.6), 0 6px 10px -2px rgba(0, 0, 0, 0.3)'
          : '0 3px 6px rgba(0,0,0,0.35)',
      }}
    >
      {/* CỘT SỐ VÀ CHẤT Ở GÓC TRÊN BÊN TRÁI (LUÔN LỘ RA KHI XẾP XÒE GỐI ĐÈ NHAU) */}
      <div className={`flex flex-col items-center leading-none self-start ${colorClass}`}>
        <span className="font-black text-base sm:text-xl md:text-2xl tracking-tighter leading-none">
          {rankLabel}
        </span>
        <span className="text-xs sm:text-sm md:text-base leading-none mt-0.5">
          {suitInfo.symbol}
        </span>
      </div>

      {/* BIỂU TƯỢNG CHẤT 3D Ở GIỮA / DƯỚI (LỘ RA TRỌN VẸN Ở LÁ BÀI CUỐI VÀ KHI CHỌN BÀI) */}
      <div className="self-end mt-auto flex items-center justify-center pointer-events-none pr-0.5 pb-0.5">
        {suit === 'diamonds' ? (
          <div className="w-3.5 h-3.5 sm:w-5 sm:h-5 md:w-6 md:h-6 rotate-45 bg-gradient-to-br from-red-500 via-rose-600 to-red-700 shadow-xs rounded-[1px]" />
        ) : suit === 'hearts' ? (
          <span className="text-xl sm:text-2xl md:text-3xl text-red-600 font-bold select-none leading-none drop-shadow-xs">
            ♥
          </span>
        ) : suit === 'clubs' ? (
          <span className="text-xl sm:text-2xl md:text-3xl text-slate-900 font-bold select-none leading-none drop-shadow-xs">
            ♣
          </span>
        ) : (
          <span className="text-xl sm:text-2xl md:text-3xl text-slate-900 font-bold select-none leading-none drop-shadow-xs">
            ♠
          </span>
        )}
      </div>

      {/* Chấm vàng nhỏ báo hiệu lá được gợi ý */}
      {isHighlighted && !isSelected && (
        <div className="absolute top-1 right-1 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-yellow-400 rounded-full border border-white shadow-xs flex items-center justify-center">
          <span className="w-1 h-1 bg-amber-700 rounded-full animate-ping" />
        </div>
      )}
    </div>
  );
};
