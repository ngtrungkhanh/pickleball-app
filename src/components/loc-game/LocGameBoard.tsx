'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { TableState } from '@/lib/loc-game/network-types';
import { Card } from '@/lib/loc-game/types';
import { analyzeCombo, canBeat } from '@/lib/loc-game/analyzer';
import { hasAnyPlayableMove } from '@/lib/loc-game/smart-hint';
import { BotBrain } from '@/lib/loc-game/bot';
import { LocHand } from './LocHand';
import { LocOpponent } from './LocOpponent';
import { LocCard } from './LocCard';
import { LocRoundOverModal } from './LocRoundOverModal';
import { ArrowLeft, HelpCircle, Volume2, Users, RotateCcw, Bot } from 'lucide-react';

interface LocGameBoardProps {
  tableState: TableState;
  myPlayerId: string;
  myHand: Card[];
  isSpectator: boolean;
  onPlayCards: (cards: Card[]) => void;
  onPassTurn: () => void;
  onCallSam: () => void;
  onSkipSam: () => void;
  onStartGame: () => void;
  onLeaveRoom: () => void;
  onNextRound?: () => void;
  onAddBot?: () => void;
  onRemoveBot?: (botId: string) => void;
}

export const LocGameBoard: React.FC<LocGameBoardProps> = ({
  tableState,
  myPlayerId,
  myHand,
  isSpectator,
  onPlayCards,
  onPassTurn,
  onCallSam,
  onSkipSam,
  onStartGame,
  onLeaveRoom,
  onNextRound,
  onAddBot,
  onRemoveBot,
}) => {
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [now, setNow] = useState<number>(() => Date.now());
  const [isRotated, setIsRotated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      // Nếu màn hình vốn đã là khổ ngang (desktop, tablet ngang), tuyệt đối KHÔNG xoay
      if (window.innerWidth >= window.innerHeight) {
        sessionStorage.removeItem('loc_force_rotated');
        return false;
      }
      const saved = sessionStorage.getItem('loc_force_rotated');
      if (saved !== null) return saved === 'true';
    }
    return false;
  });

  // Tự động nhận biết thay đổi kích thước cửa sổ
  useEffect(() => {
    const handleResize = () => {
      // Khi ở màn hình ngang (như Desktop), luôn reset về chế độ chuẩn, không xoay
      if (window.innerWidth >= window.innerHeight) {
        setIsRotated(false);
        sessionStorage.removeItem('loc_force_rotated');
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Khóa cuộn trang khi xoay 90 độ để bàn chơi cố định tuyệt đối
  useEffect(() => {
    if (isRotated) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isRotated]);

  const handleToggleRotate = () => {
    if (typeof window !== 'undefined') {
      if (window.innerWidth >= window.innerHeight) {
        alert('Màn hình của bạn đã ở chế độ ngang tối ưu, không cần xoay!');
        return;
      }
      const next = !isRotated;
      setIsRotated(next);
      sessionStorage.setItem('loc_force_rotated', String(next));
    }
  };

  const {
    roomName,
    status,
    players,
    currentTurnPlayerId,
    roundLeaderPlayerId,
    lastPlay,
    samState,
    playHistory,
    turnDeadline,
  } = tableState;

  const isHost = players.find((p) => p.id === myPlayerId)?.isHost ?? false;
  const isMyTurn = currentTurnPlayerId === myPlayerId && status === 'playing';
  const myPlayer = players.find((p) => p.id === myPlayerId);

  // Cập nhật mốc thời gian mỗi 250ms cho các bộ đếm ngược
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  // 1. TÍNH BỘ ĐẾM 30S CHO MỖI LƯỢT ĐÁNH
  const turnSecondsLeft = useMemo(() => {
    if (status !== 'playing' || !turnDeadline) return null;
    return Math.max(0, Math.ceil((turnDeadline - now) / 1000));
  }, [status, turnDeadline, now]);

  // 2. TÍNH BỘ ĐẾM 60S CHO BÁO SÂM
  const samSecondsLeft = useMemo(() => {
    if (status !== 'sam_calling' || !samState?.deadline) return null;
    return Math.max(0, Math.ceil((samState.deadline - now) / 1000));
  }, [status, samState, now]);

  // Kiểm tra xem bạn đã bấm Huỷ Báo Sâm chưa
  const hasSkippedSam = useMemo(() => {
    return Boolean(samState?.skipPlayerIds?.includes(myPlayerId));
  }, [samState, myPlayerId]);

  // 3. TỰ ĐỘNG BỎ LƯỢT KHI KHÔNG CÓ BÀI CÓ THỂ ĐÁNH
  const cannotBeat = useMemo(() => {
    if (!isMyTurn || isSpectator || status !== 'playing' || !lastPlay) return false;
    return !hasAnyPlayableMove(myHand, lastPlay.combo);
  }, [isMyTurn, isSpectator, status, lastPlay, myHand]);

  useEffect(() => {
    if (cannotBeat) {
      const timer = setTimeout(() => {
        onPassTurn();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [cannotBeat, onPassTurn]);

  // Khởi tạo AI BotBrain tính toán gợi ý nước đi tối ưu
  const botBrain = useMemo(() => new BotBrain(), []);

  // Cập nhật bộ nhớ tracker khi có bài đánh ra
  useEffect(() => {
    if (lastPlay?.combo?.cards) {
      botBrain.getTracker().recordPlay(lastPlay.combo.cards);
    }
  }, [lastPlay, botBrain]);

  // Reset tracker khi ván mới bắt đầu
  useEffect(() => {
    if (status === 'sam_calling' || status === 'waiting') {
      botBrain.getTracker().reset();
    }
  }, [status, botBrain]);

  // 4. TỰ ĐỘNG ĐỀ XUẤT LÁ NÊN ĐÁNH BẰNG BOT AI (SÁNG GỢI Ý THÔNG MINH)
  const suggestedDecision = useMemo(() => {
    if (!isMyTurn || isSpectator || status !== 'playing') return null;
    return botBrain.decideMove(myPlayerId, myHand, tableState);
  }, [isMyTurn, isSpectator, status, botBrain, myPlayerId, myHand, tableState]);

  const suggestedCardIds = useMemo(() => {
    if (!suggestedDecision || suggestedDecision.action !== 'PLAY') return [];
    return suggestedDecision.cards.map((c) => c.id);
  }, [suggestedDecision]);

  // 5. GỢI Ý BÀI NẾU SAU 15S TRONG LƯỢT KHÔNG ĐÁNH
  const [isTurnOver15s, setIsTurnOver15s] = useState<boolean>(false);
  useEffect(() => {
    if (!isMyTurn || status !== 'playing') {
      return;
    }
    const timer = setTimeout(() => {
      setIsTurnOver15s(true);
    }, 15000); // Đủ 15 giây mới kích hoạt gợi ý
    return () => {
      clearTimeout(timer);
      setIsTurnOver15s(false);
    };
  }, [isMyTurn, status, currentTurnPlayerId]);

  const showAiHint = isMyTurn && isTurnOver15s;

  // Danh sách đối thủ
  const opponents = useMemo(() => {
    return players.filter((p) => p.id !== myPlayerId);
  }, [players, myPlayerId]);

  // Phân bổ đối thủ theo số lượng
  const { leftOpponent, topOpponents, rightOpponent } = useMemo(() => {
    if (opponents.length === 0) {
      return { leftOpponent: null, topOpponents: [], rightOpponent: null };
    }
    if (opponents.length === 1) {
      return { leftOpponent: null, topOpponents: [opponents[0]], rightOpponent: null };
    }
    if (opponents.length === 2) {
      return { leftOpponent: opponents[0], topOpponents: [], rightOpponent: opponents[1] };
    }
    if (opponents.length === 3) {
      return { leftOpponent: opponents[0], topOpponents: [opponents[1]], rightOpponent: opponents[2] };
    }
    return {
      leftOpponent: opponents[0] || null,
      topOpponents: opponents.slice(1, 3),
      rightOpponent: opponents[3] || null,
    };
  }, [opponents]);

  // Phân tích bộ bài đang chọn
  const selectedCards = useMemo(() => {
    const idSet = new Set(selectedCardIds);
    return myHand.filter((c) => idSet.has(c.id));
  }, [myHand, selectedCardIds]);

  const selectedCombo = useMemo(() => {
    return analyzeCombo(selectedCards);
  }, [selectedCards]);

  // Kiểm tra nút Đánh có sáng lên không
  const canPlay = useMemo(() => {
    if (!isMyTurn || isSpectator || selectedCombo.type === 'INVALID') {
      return false;
    }
    if (!lastPlay) {
      return true; // Đi đầu vòng bàn trống
    }
    return canBeat(selectedCombo, lastPlay.combo);
  }, [isMyTurn, isSpectator, selectedCombo, lastPlay]);

  // Kiểm tra nút Cho Qua (Bỏ lượt)
  const canPass = useMemo(() => {
    if (!isMyTurn || isSpectator) return false;
    if (roundLeaderPlayerId === myPlayerId || !lastPlay) return false;
    return true;
  }, [isMyTurn, isSpectator, roundLeaderPlayerId, myPlayerId, lastPlay]);

  const handlePlayClick = () => {
    if (canPlay) {
      onPlayCards(selectedCards);
      setSelectedCardIds([]);
    }
  };

  const handlePassClick = () => {
    if (canPass) {
      onPassTurn();
      setSelectedCardIds([]);
    }
  };

  return (
    <div
      className="relative bg-[#0b1a2d] overflow-hidden select-none font-sans flex flex-col justify-between"
      style={
        isRotated
          ? {
              position: 'fixed',
              top: 0,
              left: '100%',
              width: '100dvh',
              height: '100dvw',
              transform: 'rotate(90deg)',
              transformOrigin: 'top left',
              zIndex: 9999,
              overflow: 'hidden',
            }
          : {
              width: '100%',
              height: '100dvh',
            }
      }
    >
      {/* 1. THANH TIÊU ĐỀ TRÊN CÙNG */}
      <header className="relative z-30 flex items-center justify-between px-3 sm:px-8 py-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onLeaveRoom}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#4a1024] hover:bg-[#5e162f] border border-white/20 flex items-center justify-center text-white shadow-lg active:scale-95 transition cursor-pointer"
            title="Rời bàn"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="px-3.5 py-1.5 rounded-xl bg-black/60 border border-white/10 backdrop-blur-sm">
            <span className="text-xs sm:text-sm font-extrabold text-amber-200">
              Bàn: {roomName}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Nút Xoay ngang 90 độ (Chủ động xoay hoặc tự động khi màn hình dọc) */}
          <button
            type="button"
            onClick={handleToggleRotate}
            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-bold transition shadow-md cursor-pointer ${
              isRotated
                ? 'bg-amber-400 text-slate-950 border border-amber-200'
                : 'bg-black/60 hover:bg-black/80 text-amber-300 border border-amber-400/40'
            }`}
            title="Xoay ngang 90 độ bàn chơi"
          >
            <RotateCcw className={`w-3.5 h-3.5 transition-transform duration-200 ${isRotated ? 'rotate-90' : ''}`} />
            <span className="text-[11px] sm:text-xs font-mono font-bold">
              {isRotated ? 'Ngang (90°)' : 'Xoay'}
            </span>
          </button>

          {isSpectator && (
            <span className="text-xs font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 px-2.5 py-1 rounded-full">
              Khán giả
            </span>
          )}
          <button
            type="button"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-200 hover:bg-white text-slate-800 flex items-center justify-center font-bold shadow-md cursor-pointer"
            title="Trợ giúp"
          >
            <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700" />
          </button>
          <button
            type="button"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 text-amber-950 flex items-center justify-center shadow-md cursor-pointer"
            title="Âm thanh"
          >
            <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </header>

      {/* 2. BÀN CHƠI HÌNH OVAL NỈ ĐỎ MẬN CHÍN VỚI VIỀN GỖ BO TRÒN */}
      <div className="relative flex-1 w-full max-w-full flex flex-col items-center justify-between mx-auto my-1 px-1 sm:px-4 py-1.5 sm:py-3 rounded-[30px] sm:rounded-[60px] md:rounded-[100px] border-[6px] sm:border-[12px] md:border-[16px] border-[#92400e]/95 bg-gradient-to-br from-[#741838] via-[#591029] to-[#3f0b1c] shadow-[inset_0_0_60px_rgba(0,0,0,0.85),0_20px_45px_rgba(0,0,0,0.95)] overflow-hidden min-h-0">
        {/* Họa tiết nỉ nhung chìm */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(#ffffff 1px, transparent 1px), radial-gradient(#ffffff 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 10px 10px',
          }}
        />

        {/* --- ĐỐI THỦ PHÍA TRÊN --- */}
        <div className="relative z-20 flex items-center justify-center gap-4 sm:gap-6 pt-1 shrink-0">
          {topOpponents.map((opp) =>
            opp && opp.id ? (
              <LocOpponent
                key={opp.id}
                player={opp}
                isCurrentTurn={currentTurnPlayerId === opp.id}
                turnSecondsLeft={currentTurnPlayerId === opp.id ? turnSecondsLeft : null}
                cardPosition="right"
              />
            ) : null
          )}
        </div>

        {/* --- KHU VỰC GIỮA BÀN: ĐỐI THỦ HAI BÊN & BÀI VỪA ĐÁNH --- */}
        <div className="w-full flex-1 flex items-center justify-between px-1 sm:px-4 relative z-20 min-h-0 my-auto">
          {/* Đối thủ bên trái (Tự thu nhỏ khi màn hình hẹp để không ép khu vực bài) */}
          <div className="shrink-0 w-16 sm:w-28 md:w-32 flex justify-start">
            {leftOpponent && (
              <div className="scale-75 sm:scale-100 origin-left">
                <LocOpponent
                  player={leftOpponent}
                  isCurrentTurn={currentTurnPlayerId === leftOpponent.id}
                  turnSecondsLeft={currentTurnPlayerId === leftOpponent.id ? turnSecondsLeft : null}
                  cardPosition="right"
                />
              </div>
            )}
          </div>

          {/* VÙNG CHÍNH GIỮA BÀN: BÀI VỪA ĐÁNH / TRẠNG THÁI PHÒNG */}
          <div className="flex-1 flex flex-col items-center justify-center max-w-md px-1 min-h-0">
            {/* TRƯỜNG HỢP 1: PHÒNG CHỜ (WAITING) */}
            {status === 'waiting' && (
              <div className="flex flex-col items-center text-center p-3 sm:p-4 rounded-2xl bg-black/50 border border-white/10 backdrop-blur-sm shadow-2xl">
                <span className="text-xs sm:text-base font-extrabold text-amber-200 mb-2 sm:mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                  {players.length < 3
                    ? `Cần thêm người chơi (${players.length}/3 - 5)`
                    : `Phòng sẵn sàng (${players.length}/5 người)`}
                </span>

                {isHost ? (
                  <div className="flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={onStartGame}
                      disabled={players.length < 3}
                      className="px-6 sm:px-8 py-2 sm:py-3 rounded-xl font-black text-sm sm:text-base bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-xl hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      Bắt đầu ván
                    </button>

                    {/* Cụm nút Thêm / Bớt Bot AI */}
                    <div className="flex items-center gap-2 mt-1">
                      {players.length < 5 && onAddBot && (
                        <button
                          type="button"
                          onClick={onAddBot}
                          className="px-2.5 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-bold bg-indigo-600/80 hover:bg-indigo-600 text-white border border-indigo-400/30 flex items-center gap-1 active:scale-95 transition cursor-pointer"
                        >
                          <Bot className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          + Thêm Bot
                        </button>
                      )}
                      {players.some((p) => p.isBot) && onRemoveBot && (
                        <button
                          type="button"
                          onClick={() => {
                            const lastBot = [...players].reverse().find((p) => p.isBot);
                            if (lastBot) onRemoveBot(lastBot.id);
                          }}
                          className="px-2.5 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-bold bg-rose-600/80 hover:bg-rose-600 text-white border border-rose-400/30 flex items-center gap-1 active:scale-95 transition cursor-pointer"
                        >
                          - Bớt Bot
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-slate-300 animate-pulse font-medium">
                    Đang đợi chủ phòng bắt đầu...
                  </span>
                )}
              </div>
            )}

            {/* TRƯỜNG HỢP 2: BÁO SÂM */}
            {status === 'sam_calling' && (
              <div className="flex flex-col items-center gap-2">
                {!hasSkippedSam ? (
                  <>
                    <button
                      type="button"
                      onClick={onCallSam}
                      className="w-36 sm:w-48 py-2 sm:py-3 rounded-2xl font-black text-sm sm:text-base text-white bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 hover:brightness-110 active:scale-95 transition shadow-[0_8px_25px_rgba(34,197,94,0.6)] border border-white/20 cursor-pointer"
                    >
                      Báo Sâm
                    </button>
                    <button
                      type="button"
                      onClick={onSkipSam}
                      className="w-36 sm:w-48 py-2 sm:py-3 rounded-2xl font-black text-sm sm:text-base text-white bg-gradient-to-r from-red-500 via-rose-500 to-red-600 hover:brightness-110 active:scale-95 transition shadow-[0_8px_25px_rgba(239,68,68,0.6)] border border-white/20 cursor-pointer"
                    >
                      Huỷ Sâm
                    </button>
                  </>
                ) : (
                  <div className="px-4 py-2 rounded-2xl font-bold text-xs sm:text-sm text-slate-200 bg-slate-900/90 border border-emerald-500/40 shadow-xl flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Đã huỷ Báo Sâm — Đang chờ người khác...
                  </div>
                )}

                {/* BỘ ĐẾM 60S KHI CHỈ CÒN 1 NGƯỜI CHƯA HUỶ BÁO */}
                {samSecondsLeft !== null && (
                  <div className="flex flex-col items-center gap-0.5 mt-1 p-1.5 sm:p-2 rounded-xl bg-black/60 border border-amber-400/30">
                    <span className="text-[10px] sm:text-[11px] font-bold text-amber-300 animate-pulse">
                      ⏳ Còn 1 người chưa chọn — Tự huỷ sau:
                    </span>
                    <span className="text-base sm:text-lg font-black font-mono text-yellow-400">
                      {samSecondsLeft}s
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* TRƯỜNG HỢP 3: BÀI VỪA ĐÁNH */}
            {status === 'playing' && lastPlay && (
              <div className="flex flex-col items-center">
                <div className="flex items-center justify-center gap-1 sm:gap-2 drop-shadow-[0_10px_16px_rgba(0,0,0,0.7)]">
                  {lastPlay.combo.cards.map((c) => (
                    <LocCard key={c.id} card={c} size="md" className="shadow-xl" />
                  ))}
                </div>
              </div>
            )}

            {/* TRƯỜNG HỢP 4: BÀN TRỐNG */}
            {status === 'playing' && !lastPlay && (
              <div className="text-xs sm:text-base font-extrabold text-amber-300 drop-shadow animate-pulse">
                Bàn trống — Hãy ra bài mới
              </div>
            )}

            {/* THÔNG BÁO TỰ ĐỘNG BỎ LƯỢT KHI KHÔNG CÓ BÀI ĐÈ */}
            {cannotBeat && (
              <div className="mt-1.5 px-3 py-1 rounded-full bg-red-950/90 border border-red-500/60 text-[11px] sm:text-xs font-bold text-red-300 animate-bounce shadow">
                Không có bài đè — Tự động qua lượt...
              </div>
            )}

            {/* Lịch sử ngắn */}
            {playHistory.length > 0 && status === 'playing' && !cannotBeat && (
              <span className="mt-1.5 text-[11px] sm:text-xs text-amber-200/90 font-semibold text-center drop-shadow truncate max-w-[280px]">
                {playHistory[playHistory.length - 1].text}
              </span>
            )}
          </div>

          {/* Đối thủ bên phải (Tự thu nhỏ khi màn hình hẹp) */}
          <div className="shrink-0 w-16 sm:w-28 md:w-32 flex justify-end">
            {rightOpponent && (
              <div className="scale-75 sm:scale-100 origin-right">
                <LocOpponent
                  player={rightOpponent}
                  isCurrentTurn={currentTurnPlayerId === rightOpponent.id}
                  turnSecondsLeft={currentTurnPlayerId === rightOpponent.id ? turnSecondsLeft : null}
                  cardPosition="left"
                />
              </div>
            )}
          </div>
        </div>

        {/* --- CẶP NÚT "CHO QUA" & "ĐÁNH" CÙNG BỘ ĐẾM 30S (NẰM NGAY TRÊN DÃY BÀI, KHÔNG BAO GIỜ BỊ CHE) --- */}
        {isMyTurn && status === 'playing' && !isSpectator && (
          <div className="w-full flex flex-col items-center gap-1.5 py-1 z-30 select-none shrink-0">
            {/* Bộ đếm thời gian lượt 30s */}
            {turnSecondsLeft !== null && (
              <div
                className={`px-3 py-0.5 rounded-full font-black text-xs font-mono shadow-lg border flex items-center gap-1.5 ${
                  turnSecondsLeft <= 5
                    ? 'bg-red-600 text-white border-white animate-bounce'
                    : 'bg-emerald-500 text-slate-950 border-emerald-300'
                }`}
              >
                ⏱️ Thời gian đánh: {turnSecondsLeft}s
              </div>
            )}

            {/* Nhãn gợi ý nước đi tối ưu từ Bot AI: Sau 15s */}
            {showAiHint && suggestedDecision?.action === 'PLAY' && suggestedDecision.reason && (
              <button
                type="button"
                onClick={() => setSelectedCardIds(suggestedCardIds)}
                className="max-w-[90vw] px-2.5 py-0.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-[11px] font-semibold flex items-center gap-1 transition active:scale-95 shadow cursor-pointer text-center truncate animate-pulse"
                title="Nhấn để tự động chọn các lá bài AI gợi ý"
              >
                <span className="truncate">💡 Gợi ý AI: {suggestedDecision.reason}</span>
                <span className="text-[10px] underline font-bold text-amber-200 shrink-0">(Chọn)</span>
              </button>
            )}

            {/* Cặp nút Đánh & Cho qua: Bố trí song song vừa vặn */}
            <div className="flex items-center justify-center gap-3 sm:gap-6">
              <button
                type="button"
                onClick={handlePassClick}
                disabled={!canPass}
                className={`w-24 sm:w-36 py-1.5 sm:py-2.5 rounded-xl font-extrabold text-xs sm:text-base text-white transition shadow-xl cursor-pointer ${
                  canPass
                    ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:brightness-110 active:scale-95 shadow-[0_6px_20px_rgba(239,68,68,0.6)] border border-white/20'
                    : 'bg-slate-700/60 text-slate-400 opacity-50 cursor-not-allowed'
                }`}
              >
                Cho Qua
              </button>

              <button
                type="button"
                onClick={handlePlayClick}
                disabled={!canPlay}
                className={`w-24 sm:w-36 py-1.5 sm:py-2.5 rounded-xl font-extrabold text-xs sm:text-base transition shadow-xl cursor-pointer ${
                  canPlay
                    ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:brightness-110 active:scale-95 shadow-[0_6px_20px_rgba(34,197,94,0.7)] border border-white/20 ring-2 ring-emerald-300 animate-pulse'
                    : 'bg-slate-700/80 text-slate-300 opacity-60 cursor-not-allowed border border-white/10'
                }`}
              >
                Đánh
              </button>
            </div>
          </div>
        )}

        {/* --- 3. DƯỚI CÙNG: BỘ BÀI CỦA BẠN (TỰ ĐỘNG GỢI Ý SAU 15S & ĐẾM 30S) --- */}
        <div className="w-full shrink-0">
          <LocHand
            hand={myHand}
            tableCombo={lastPlay?.combo ?? null}
            isMyTurn={isMyTurn}
            selectedCardIds={selectedCardIds}
            onSelectionChange={setSelectedCardIds}
            disabled={status !== 'playing' || !isMyTurn || isSpectator}
            playerName={myPlayer?.name || 'You'}
            dimHintCardIds={showAiHint ? suggestedCardIds : []}
            isUrgentHint={showAiHint}
            turnSecondsLeft={isMyTurn ? turnSecondsLeft : null}
          />
        </div>
      </div>

      {/* POPUP TỔNG KẾT VÁN ĐẤU (Nằm trong container để xoay đồng bộ 100%) */}
      {status === 'round_ended' && tableState.roundResult && (
        <LocRoundOverModal
          scoreboard={tableState.roundResult}
          isHost={isHost}
          onNextRound={onNextRound || (() => {})}
        />
      )}
    </div>
  );
};
