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
  size?: 'sm' | 'md' | 'lg' | 'xl';
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
  // Kích thước lá bài TO LỚN vượt trội, tận dụng tối đa chiều ngang và chiều cao cả Mobile ngang và PC
  const sizeClasses = {
    sm: 'w-10 sm:w-12 md:w-14 aspect-[2.5/3.5] rounded-md shadow-xs',
    md: 'w-18 sm:w-22 md:w-26 lg:w-30 aspect-[2.5/3.5] rounded-lg sm:rounded-xl shadow-md',
    lg: 'w-22 sm:w-26 md:w-32 aspect-[2.5/3.5] rounded-xl shadow-lg',
    xl: 'w-24 sm:w-28 md:w-36 aspect-[2.5/3.5] rounded-xl shadow-xl',
  }[size];

  // 1. MẶT LƯNG BÀI: Xanh dương kẻ quả trám, vòng tròn ghi số lá còn lại (Chuẩn ZingPlay)
  if (faceDown || !card) {
    return (
      <div
        onClick={!disabled ? onClick : undefined}
        className={`relative select-none border-2 border-white/90 flex items-center justify-center overflow-hidden transition-transform shadow-md bg-[#0284c7] opacity-100 ${sizeClasses} ${className}`}
        style={{
          background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 50%, #0369a1 100%)',
        }}
      >
        <div
          className="absolute inset-0.5 rounded border border-white/30 opacity-40 pointer-events-none"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.4) 5px, rgba(255,255,255,0.4) 10px),
                              repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(255,255,255,0.4) 5px, rgba(255,255,255,0.4) 10px)`,
          }}
        />

        {remainingCount !== undefined && (
          <div className="relative z-10 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-sky-950/90 border-2 border-white flex items-center justify-center shadow-inner">
            <span className="font-extrabold text-white text-xs sm:text-sm drop-shadow">
              {remainingCount}
            </span>
          </div>
        )}
      </div>
    );
  }

  // 2. MẶT TRƯỚC LÁ BÀI (Độ mờ = 0, che tuyệt đối phần lá dưới, số và chất to rõ ràng)
  const { rank, suit } = card;
  const suitInfo = SUIT_ICONS[suit];
  const rankLabel = formatRank(rank);
  const colorClass = suitInfo.isRed ? 'text-red-600' : 'text-slate-900';

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      className={`relative select-none cursor-pointer bg-white opacity-100 transition-all duration-150 flex flex-col justify-between p-1.5 sm:p-2 border border-slate-300 overflow-hidden ${
        isSelected
          ? '-translate-y-6 sm:-translate-y-8 shadow-2xl ring-4 ring-yellow-400 border-yellow-500 z-30'
          : isHighlighted
          ? '-translate-y-3 sm:-translate-y-4 ring-3 ring-amber-300 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.95),0_0_35px_rgba(234,179,8,0.5)] z-20'
          : isDimHint
          ? '-translate-y-2.5 sm:-translate-y-3.5 ring-3 ring-amber-400 border-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.9),0_0_30px_rgba(245,158,11,0.45)] z-20'
          : 'hover:-translate-y-1 hover:shadow-md'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${sizeClasses} ${className}`}
      style={{
        backgroundColor: '#ffffff', // Trắng đặc 100%, không xuyên thấu
        boxShadow: isSelected
          ? '0 20px 35px -5px rgba(0, 0, 0, 0.7), 0 8px 12px -3px rgba(0, 0, 0, 0.4)'
          : '0 4px 8px rgba(0, 0, 0, 0.35)',
      }}
    >
      {/* Ánh sáng vàng dịu nhẹ phủ mặt bài khi AI gợi ý */}
      {(isHighlighted || isDimHint) && !isSelected && (
        <div className="absolute inset-0 bg-amber-300/15 pointer-events-none animate-pulse border-t-2 border-amber-400/80" />
      )}

      {/* CỘT SỐ VÀ CHẤT Ở GÓC TRÊN BÊN TRÁI: TO RÕ, NÉT ĐẬM */}
      <div className={`flex flex-col items-center leading-none self-start select-none ${colorClass}`}>
        <span className="font-black text-xl sm:text-2xl md:text-3xl tracking-tighter leading-none">
          {rankLabel}
        </span>
        <span className="text-sm sm:text-lg md:text-xl leading-none mt-0.5">
          {suitInfo.symbol}
        </span>
      </div>

      {/* BIỂU TƯỢNG CHẤT 3D Ở GÓC DƯỚI BÊN PHẢI (LỘ RA TRỌN VẸN Ở LÁ BÀI CUỐI VÀ KHI CHỌN BÀI) */}
      <div className="self-end mt-auto flex items-center justify-center pointer-events-none pr-0.5 pb-0.5">
        {suit === 'diamonds' ? (
          <div className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 rotate-45 bg-gradient-to-br from-red-500 via-rose-600 to-red-700 shadow-xs rounded-[2px]" />
        ) : suit === 'hearts' ? (
          <span className="text-2xl sm:text-3xl md:text-4xl text-red-600 font-bold select-none leading-none drop-shadow-xs">
            ♥
          </span>
        ) : suit === 'clubs' ? (
          <span className="text-2xl sm:text-3xl md:text-4xl text-slate-900 font-bold select-none leading-none drop-shadow-xs">
            ♣
          </span>
        ) : (
          <span className="text-2xl sm:text-3xl md:text-4xl text-slate-900 font-bold select-none leading-none drop-shadow-xs">
            ♠
          </span>
        )}
      </div>
    </div>
  );
};
