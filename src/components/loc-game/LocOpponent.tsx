'use client';

import React from 'react';
import { RoomPlayer } from '@/lib/loc-game/network-types';
import { LocCard } from './LocCard';
import { Crown } from 'lucide-react';

interface LocOpponentProps {
  player: RoomPlayer;
  isCurrentTurn: boolean;
  cardPosition?: 'left' | 'right';
  turnSecondsLeft?: number | null;
  className?: string;
}

// Hàm sinh màu tóc / phụ kiện avatar theo ID người chơi để mỗi người có 1 ngoại hình chibi riêng
function getAvatarProps(playerId: string) {
  const hash = playerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const skinColors = ['#fbcfe8', '#fed7aa', '#fde047', '#fcd34d', '#fed7aa'];
  const hairColors = ['#eab308', '#78350f', '#18181b', '#991b1b', '#d97706'];
  const clothesColors = ['#2563eb', '#dc2626', '#16a34a', '#7c3aed', '#ea580c'];

  return {
    skin: skinColors[hash % skinColors.length],
    hair: hairColors[(hash + 1) % hairColors.length],
    clothes: clothesColors[(hash + 2) % clothesColors.length],
    hasGlasses: hash % 2 === 0,
    hasMustache: hash % 3 === 0,
  };
}

export const LocOpponent: React.FC<LocOpponentProps> = ({
  player,
  isCurrentTurn,
  cardPosition = 'right',
  turnSecondsLeft = null,
  className = '',
}) => {
  const isOneCardLeft = player.cardsRemaining === 1;
  const avatar = getAvatarProps(player.id);

  // Khung Avatar nhân vật
  const avatarBox = (
    <div
      className={`relative flex flex-col items-center justify-between w-18 sm:w-20 md:w-22 p-1 rounded-xl bg-black/75 border border-white/10 transition-all duration-200 select-none shadow-xl ${
        isCurrentTurn
          ? 'ring-3 sm:ring-4 ring-emerald-500 border-emerald-400 shadow-[0_0_20px_rgba(34,197,94,0.6)]'
          : player.hasPassed
          ? 'opacity-60'
          : ''
      }`}
    >
      {/* Bộ đếm 30s khi tới lượt của đối thủ */}
      {isCurrentTurn && turnSecondsLeft !== null && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30">
          <div
            className={`px-2 py-0.5 rounded-full font-black text-[11px] font-mono shadow-lg border flex items-center gap-1 ${
              turnSecondsLeft <= 5
                ? 'bg-red-600 text-white border-white animate-bounce'
                : 'bg-emerald-500 text-slate-950 border-emerald-300'
            }`}
          >
            ⏱️ {turnSecondsLeft}s
          </div>
        </div>
      )}
      {/* Tên người chơi */}
      <div className="w-full text-center px-1 flex items-center justify-center gap-1">
        <span className="text-[11px] sm:text-xs font-bold text-white truncate block">
          {player.name}
        </span>
        {player.isBot && (
          <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-500/80 text-white font-black tracking-tight shrink-0">
            BOT
          </span>
        )}
      </div>

      {/* Hình Chibi Avatar */}
      <div className="relative w-11 h-11 sm:w-13 sm:h-13 my-0.5 flex items-center justify-center">
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow">
          {/* Thân áo */}
          <path d="M 20 100 C 20 70 80 70 80 100 Z" fill={avatar.clothes} />
          {/* Cổ áo trắng */}
          <polygon points="40,80 50,92 60,80 50,75" fill="#ffffff" />
          {/* Đầu & Mặt */}
          <circle cx="50" cy="50" r="28" fill={avatar.skin} />
          {/* Tóc */}
          <path d="M 22 45 C 22 20 78 20 78 45 C 75 35 25 35 22 45 Z" fill={avatar.hair} />
          {/* Mắt */}
          <circle cx="40" cy="48" r="3.5" fill="#18181b" />
          <circle cx="60" cy="48" r="3.5" fill="#18181b" />
          {/* Mũi & Miệng cười */}
          <ellipse cx="50" cy="54" rx="2" ry="1.5" fill="#e11d48" />
          <path d="M 44 60 Q 50 66 56 60" stroke="#18181b" strokeWidth="2" fill="none" />

          {/* Kính mắt (nếu có) */}
          {avatar.hasGlasses && (
            <g stroke="#18181b" strokeWidth="2.5" fill="none">
              <rect x="33" y="42" width="14" height="12" rx="3" fill="rgba(255,255,255,0.4)" />
              <rect x="53" y="42" width="14" height="12" rx="3" fill="rgba(255,255,255,0.4)" />
              <line x1="47" y1="48" x2="53" y2="48" />
            </g>
          )}

          {/* Râu (nếu có) */}
          {avatar.hasMustache && (
            <path d="M 42 58 Q 50 56 58 58 Q 50 63 42 58 Z" fill={avatar.hair} />
          )}
        </svg>

        {/* Vương miện nếu là Host */}
        {player.isHost && (
          <div className="absolute -top-1.5 -left-1.5 bg-amber-400 text-slate-950 p-0.5 rounded-full shadow">
            <Crown className="w-3 h-3 fill-slate-950" />
          </div>
        )}

        {/* Biểu tượng "Cho qua" đè lên avatar khi bỏ lượt (như ảnh mẫu) */}
        {player.hasPassed && (
          <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center backdrop-blur-xs">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-red-600 border-2 border-white flex items-center justify-center shadow-lg">
              <span className="text-sm sm:text-base select-none">✋</span>
            </div>
          </div>
        )}

        {/* CHỮ "BÁO 1" 3D VÀNG KIM LOẠI NHẤP NHÁY (Chuẩn 100% ảnh mẫu) */}
        {isOneCardLeft && (
          <div className="absolute -inset-1 flex items-center justify-center z-20 pointer-events-none">
            <div
              className="text-center font-black text-xs sm:text-sm tracking-wider uppercase px-1.5 py-0.5 rounded bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 text-amber-950 border-2 border-white shadow-[0_4px_12px_rgba(234,179,8,0.9)] animate-bounce"
              style={{
                textShadow: '0 1px 2px rgba(255,255,255,0.8), 0 -1px 1px rgba(0,0,0,0.4)',
              }}
            >
              BÁO 1
            </div>
          </div>
        )}
      </div>

      {/* Số tiền/điểm xu vàng phía dưới avatar */}
      <div className="w-full flex items-center justify-center gap-1 bg-black/40 rounded py-0.5">
        <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-amber-600 to-yellow-300 border border-yellow-200 flex items-center justify-center text-[8px] font-black text-amber-950 shadow-xs">
          €
        </span>
        <span className="text-[10px] sm:text-[11px] font-bold text-amber-300 font-mono">
          {player.cardsRemaining * 25}
        </span>
      </div>
    </div>
  );

  // Lá bài úp hiển thị số lượng lá bài còn lại
  const cardBox = (
    <LocCard
      faceDown
      remainingCount={player.cardsRemaining}
      size="md"
      className="shrink-0"
    />
  );

  return (
    <div className={`flex items-center gap-2 select-none ${className}`}>
      {cardPosition === 'left' ? (
        <>
          {cardBox}
          {avatarBox}
        </>
      ) : (
        <>
          {avatarBox}
          {cardBox}
        </>
      )}
    </div>
  );
};
