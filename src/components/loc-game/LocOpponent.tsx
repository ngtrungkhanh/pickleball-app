'use client';

import React from 'react';
import { RoomPlayer } from '@/lib/loc-game/network-types';
import { Card, PlayerScoreDetail } from '@/lib/loc-game/types';
import { LocCard } from './LocCard';
import { Crown, Trophy, Flame, AlertTriangle } from 'lucide-react';

interface LocOpponentProps {
  player: RoomPlayer;
  isCurrentTurn: boolean;
  isNextTurn?: boolean;
  isRoundPlaying?: boolean;
  cardPosition?: 'left' | 'right';
  turnSecondsLeft?: number | null;
  className?: string;
  isRoundEnded?: boolean;
  remainingCards?: Card[] | null;
  scoreDetail?: PlayerScoreDetail | null;
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
  isNextTurn = false,
  isRoundPlaying = true,
  cardPosition = 'right',
  turnSecondsLeft = null,
  className = '',
  isRoundEnded = false,
  remainingCards = null,
  scoreDetail = null,
}) => {
  const isPassed = Boolean(isRoundPlaying && player.hasPassed);
  const isOneCardLeft = player.cardsRemaining === 1;
  const avatar = getAvatarProps(player.id);
  const isWinner = Boolean(scoreDetail?.isWinner);

  // Khung Avatar nhân vật
  const avatarBox = (
    <div
      className={`loc-opponent-avatar relative z-20 shrink-0 flex flex-col items-center justify-between w-18 sm:w-20 md:w-22 p-1 rounded-xl transition-all duration-200 select-none shadow-xl ${
        isWinner
          ? 'bg-amber-950/90 ring-3 ring-amber-400 border-amber-300 shadow-[0_0_25px_rgba(251,191,36,0.8)]'
          : isCurrentTurn
          ? 'bg-black/85 ring-3 sm:ring-4 ring-emerald-400 border-emerald-300 shadow-[0_0_25px_rgba(52,211,153,0.7),inset_0_0_15px_rgba(52,211,153,0.2)] animate-pulse'
          : isPassed
          ? 'bg-slate-900/90 border border-slate-700/80 grayscale opacity-60 contrast-90 shadow-none'
          : isNextTurn
          ? 'bg-black/80 border border-sky-400/60 shadow-[0_0_15px_rgba(56,189,248,0.35)]'
          : 'bg-black/75 border border-white/10'
      }`}
    >
      {/* Bộ đếm 30s khi tới lượt của đối thủ */}
      {isCurrentTurn && turnSecondsLeft !== null && !isRoundEnded && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div
            className={`px-2 py-0.5 rounded-full font-black text-[11px] font-mono shadow-xl border flex items-center gap-1 ${
              turnSecondsLeft <= 5
                ? 'bg-red-600 text-white border-white animate-bounce shadow-[0_0_12px_rgba(239,68,68,0.8)]'
                : 'bg-emerald-500 text-slate-950 border-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.8)]'
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
      <div className="loc-opponent-portrait relative w-11 h-11 sm:w-13 sm:h-13 my-0.5 flex items-center justify-center">
        {/* Vòng hào quang sáng khi đang chơi */}
        {isCurrentTurn && !isRoundEnded && (
          <div className="absolute inset-0 rounded-full bg-emerald-400/25 blur-sm animate-pulse pointer-events-none" />
        )}
        {isWinner && (
          <div className="absolute inset-0 rounded-full bg-amber-400/30 blur-sm animate-pulse pointer-events-none" />
        )}

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

        {/* HUY HIỆU NGƯỜI THẮNG CUỘC KHI KẾT THÚC VÁN */}
        {isRoundEnded && isWinner && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none whitespace-nowrap">
            <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-tight bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-950 border border-white shadow-[0_2px_10px_rgba(251,191,36,0.9)] flex items-center gap-1 animate-bounce">
              <Trophy className="w-3 h-3 fill-amber-950" />
              {scoreDetail?.isSamSuccess ? 'Ăn Sâm' : 'Về Nhất'}
            </span>
          </div>
        )}

        {/* CHỮ "BÁO 1" 3D VÀNG KIM LOẠI NHẤP NHÁY (Chuẩn 100% ảnh mẫu) */}
        {!isRoundEnded && isOneCardLeft && (
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

        {/* CHỮ "QUA LƯỢT" Ở GÓC DƯỚI ICON KHI BỎ LƯỢT */}
        {!isRoundEnded && isPassed && (
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 z-20 pointer-events-none whitespace-nowrap">
            <span className="px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-tight bg-slate-800/95 text-slate-300 border border-slate-500 shadow-md">
              Qua lượt
            </span>
          </div>
        )}

        {/* CHỮ "CHUẨN BỊ" Ở GÓC DƯỚI ICON KHI CHUẨN BỊ ĐÁNH */}
        {!isRoundEnded && isNextTurn && !isCurrentTurn && !isPassed && (
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 z-20 pointer-events-none whitespace-nowrap">
            <span className="px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-tight bg-gradient-to-r from-sky-500 to-blue-600 text-white border border-sky-300 shadow-[0_2px_8px_rgba(14,165,233,0.6)] animate-pulse">
              Chuẩn bị
            </span>
          </div>
        )}
      </div>

      {/* Số lá thực nhận / phạt khi kết thúc ván, hoặc số tiền xu vàng khi đang chơi */}
      {isRoundEnded && scoreDetail ? (
        <div className="w-full flex flex-col items-center justify-center gap-0.5 rounded py-0.5 bg-black/60 border border-white/10">
          <span
            className={`text-[11px] sm:text-xs font-black font-mono leading-none ${
              scoreDetail.netCards > 0
                ? 'text-emerald-300'
                : scoreDetail.netCards === 0
                ? 'text-slate-300'
                : 'text-rose-400'
            }`}
          >
            {scoreDetail.netCards > 0 ? `+${scoreDetail.netCards}` : scoreDetail.netCards} lá
          </span>
          {/* Tag phạt nhỏ */}
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
        <div className="w-full flex items-center justify-center gap-1 bg-black/40 rounded py-0.5">
          <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-amber-600 to-yellow-300 border border-yellow-200 flex items-center justify-center text-[8px] font-black text-amber-950 shadow-xs">
            €
          </span>
          <span className="text-[10px] sm:text-[11px] font-bold text-amber-300 font-mono">
            {player.cardsRemaining * 25}
          </span>
        </div>
      )}
    </div>
  );

  // Lá bài của đối thủ: Khi kết thúc ván thì NGỬA BÀI, khi đang chơi thì ÚP BÀI
  const cardBox = isRoundEnded && remainingCards ? (
    <div className="loc-revealed-hand grid grid-cols-[repeat(4,minmax(0,1fr))_40px] sm:grid-cols-[repeat(4,minmax(0,1fr))_48px] md:grid-cols-[repeat(4,minmax(0,1fr))_56px] gap-y-1 w-[136px] sm:w-[160px] md:w-[184px] shrink-0">
      {remainingCards.length > 0 ? (
        remainingCards.map((c, idx) => (
          <div key={c.id} className="relative" style={{ zIndex: 10 + idx }}>
            <LocCard card={c} size="sm" className="loc-revealed-card shadow-md" />
          </div>
        ))
      ) : (
        <span className="text-[11px] font-extrabold text-amber-300/90 px-2 py-1 rounded bg-black/50 border border-amber-400/30">
          ✓ Hết bài
        </span>
      )}
    </div>
  ) : (
    <div className={isPassed ? 'opacity-60 grayscale transition-opacity' : 'transition-opacity'}>
      <LocCard
        faceDown
        remainingCount={player.cardsRemaining}
        size="md"
        className="loc-opponent-back shrink-0"
      />
    </div>
  );

  return (
    <div className={`flex shrink-0 items-center gap-2 select-none ${className}`}>
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
