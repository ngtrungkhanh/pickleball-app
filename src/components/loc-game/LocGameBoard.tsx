'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { TableState } from '@/lib/loc-game/network-types';
import { Card } from '@/lib/loc-game/types';
import { analyzeCombo, canBeat } from '@/lib/loc-game/analyzer';
import { hasAnyPlayableMove } from '@/lib/loc-game/smart-hint';
import { BotBrain } from '@/lib/loc-game/bot';
import { LocHand } from './LocHand';
import { LocOpponent } from './LocOpponent';
import { LocCard } from './LocCard';
import { LocRoundOverModal } from './LocRoundOverModal';
import { LocScoreHistoryModal } from './LocScoreHistoryModal';
import { LocDebugModal } from './LocDebugModal';
import { LocPlayHistoryModal } from './LocPlayHistoryModal';
import {
  ArrowLeft,
  Users,
  RotateCcw,
  Bot,
  Lightbulb,
  HelpCircle,
  Volume2,
} from 'lucide-react';

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
  onPlayerReady?: (isReady: boolean) => void;
  onEndRoundToWaiting?: () => void;
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
  onPlayerReady,
  onEndRoundToWaiting,
  onAddBot,
  onRemoveBot,
}) => {
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRoundOverModal, setShowRoundOverModal] = useState(false);
  const [showScoreHistory, setShowScoreHistory] = useState(false);
  const [showPlayHistoryModal, setShowPlayHistoryModal] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [confirmExitType, setConfirmExitType] = useState<'to_waiting' | 'leave_room' | null>(null);
  const [isAiHintEnabled, setIsAiHintEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('loc_ai_hint_enabled');
      return saved !== 'false';
    }
    return true;
  });

  const handleToggleAiHint = () => {
    const next = !isAiHintEnabled;
    setIsAiHintEnabled(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('loc_ai_hint_enabled', String(next));
    }
  };

  const confirmExitTypeRef = useRef(confirmExitType);
  const showSettingsModalRef = useRef(showSettingsModal);
  const showRoundOverModalRef = useRef(showRoundOverModal);
  const showPlayHistoryModalRef = useRef(showPlayHistoryModal);
  const showScoreHistoryRef = useRef(showScoreHistory);
  const showDebugModalRef = useRef(showDebugModal);
  const statusRef = useRef(tableState.status);
  const isExitingRef = useRef(false);

  useEffect(() => {
    confirmExitTypeRef.current = confirmExitType;
    showSettingsModalRef.current = showSettingsModal;
    showRoundOverModalRef.current = showRoundOverModal;
    showPlayHistoryModalRef.current = showPlayHistoryModal;
    showScoreHistoryRef.current = showScoreHistory;
    showDebugModalRef.current = showDebugModal;
    statusRef.current = tableState.status;
  });

  const handleBackClick = () => {
    if (tableState.status !== 'waiting') {
      setConfirmExitType('to_waiting');
    } else {
      setConfirmExitType('leave_room');
    }
  };

  const handleConfirmExit = () => {
    if (confirmExitType === 'to_waiting') {
      onEndRoundToWaiting?.();
    } else if (confirmExitType === 'leave_room') {
      isExitingRef.current = true;
      onLeaveRoom();
    }
    setConfirmExitType(null);
  };

  // CHẶN NÚT BACK CỦA ANDROID / TRÌNH DUYỆT ĐỂ KHÔNG BỊ OUT RA BXH
  useEffect(() => {
    // Đẩy 1 dummy state vào lịch sử duyệt web để chặn nút Back
    window.history.pushState({ inLocGameRoom: true }, '');

    const handlePopState = () => {
      if (isExitingRef.current) return;

      // Giữ lại state để không bị back ra trang trước (BXH)
      window.history.pushState({ inLocGameRoom: true }, '');

      // 1. Nếu đang mở modal nào đó -> đóng modal đó trước
      if (confirmExitTypeRef.current) {
        setConfirmExitType(null);
        return;
      }
      if (showPlayHistoryModalRef.current) {
        setShowPlayHistoryModal(false);
        return;
      }
      if (showScoreHistoryRef.current) {
        setShowScoreHistory(false);
        return;
      }
      if (showDebugModalRef.current) {
        setShowDebugModal(false);
        return;
      }

      // 2. Nếu đang trong ván đấu -> hiện popup xác nhận về phòng chờ
      if (statusRef.current !== 'waiting') {
        setConfirmExitType('to_waiting');
        return;
      }

      // 3. Nếu đang ở phòng chờ -> hiện popup xác nhận rời phòng
      setConfirmExitType('leave_room');
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const [now, setNow] = useState<number>(() => Date.now());

  // TỰ ĐỘNG XOAY NGANG 90 ĐỘ KHI MÀN HÌNH DỌC (ĐIỆN THOẠI CẦM DỌC)
  const [isRotated, setIsRotated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      // Màn hình ngang thật (desktop, tablet ngang, điện thoại xoay ngang): không xoay ảo
      if (window.innerWidth >= window.innerHeight) {
        return false;
      }
      // Màn hình dọc (điện thoại cầm dọc): MẶC ĐỊNH TỰ ĐỘNG XOAY!
      const manualPref = sessionStorage.getItem('loc_manual_rotate_pref');
      if (manualPref !== null) return manualPref === 'true';
      return true;
    }
    return false;
  });

  // Tự động nhận biết thay đổi kích thước cửa sổ & xoay thiết bị
  useEffect(() => {
    const handleResize = () => {
      const isLandscape = window.innerWidth >= window.innerHeight;
      if (isLandscape) {
        // Điện thoại đã quay ngang hoặc trên PC: reset về chế độ chuẩn
        setIsRotated(false);
        sessionStorage.removeItem('loc_manual_rotate_pref');
      } else {
        // Điện thoại đang cầm dọc: tự động xoay ngang 90 độ
        const manualPref = sessionStorage.getItem('loc_manual_rotate_pref');
        if (manualPref !== null) {
          setIsRotated(manualPref === 'true');
        } else {
          setIsRotated(true);
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
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
        return;
      }
      const next = !isRotated;
      setIsRotated(next);
      sessionStorage.setItem('loc_manual_rotate_pref', String(next));
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
    turnDeadline,
    recentPlays,
  } = tableState;

  // Tối đa 2 lượt đánh gần nhất của vòng hiện tại (lượt mới đè lượt cũ)
  const currentRecentPlays = useMemo(() => {
    if (status !== 'playing') return [];
    if (recentPlays && recentPlays.length > 0) return recentPlays;
    if (lastPlay) return [lastPlay];
    return [];
  }, [status, recentPlays, lastPlay]);



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

  // TỰ ĐỘNG BẮT ĐẦU VÁN ĐẤU KHI HẾT 60S BÁO SÂM
  useEffect(() => {
    if (status === 'sam_calling' && samState?.deadline && now >= samState.deadline) {
      onSkipSam();
    }
  }, [status, samState?.deadline, now, onSkipSam]);

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

  
  // 5. XÁC ĐỊNH NGƯỜI CHƠI TIẾP THEO CHUẨN BỊ ĐÁNH
  const nextTurnPlayerId = useMemo(() => {
    if (status !== 'playing' || !currentTurnPlayerId || players.length < 2) return null;
    const currentIdx = players.findIndex((p) => p.id === currentTurnPlayerId);
    if (currentIdx === -1) return null;

    const activePlayers = players.filter((p) => !p.hasPassed);
    if (activePlayers.length <= 1) {
      return null;
    }

    for (let offset = 1; offset < players.length; offset++) {
      const nextIndex = (currentIdx + offset) % players.length;
      const nextPlayer = players[nextIndex];
      if (!nextPlayer.hasPassed) {
        return nextPlayer.id;
      }
    }

    return null;
  }, [status, currentTurnPlayerId, players]);

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
            onClick={handleBackClick}
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

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Nút Xem Sổ Nợ / Kết quả */}
          {/* Nút Bật/Tắt Gợi ý AI */}
          <button
            type="button"
            onClick={handleToggleAiHint}
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-full text-xs font-bold transition shadow-md cursor-pointer active:scale-95 ${
              isAiHintEnabled
                ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/50 shadow-[0_0_10px_rgba(245,158,11,0.25)]'
                : 'bg-black/60 hover:bg-black/80 text-slate-400 border border-white/10'
            }`}
            title={isAiHintEnabled ? 'Gợi ý bài: Đang BẬT (Bấm để tắt)' : 'Gợi ý bài: Đang TẮT (Bấm để bật)'}
          >
            <Lightbulb className={`w-3.5 h-3.5 ${isAiHintEnabled ? 'text-amber-400 fill-amber-400' : 'text-slate-400'}`} />
            <span className="text-[11px] sm:text-xs">
              Gợi ý: {isAiHintEnabled ? 'BẬT' : 'TẮT'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowScoreHistory(true)}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-bold bg-black/60 hover:bg-black/80 text-emerald-300 border border-emerald-400/40 shadow-md cursor-pointer transition active:scale-95"
            title="Xem Sổ nợ & Lịch sử ván"
          >
            <span>📊</span>
            <span className="text-[11px] sm:text-xs">
              Sổ nợ{tableState.completedRounds && tableState.completedRounds.length > 0 ? ` (${tableState.completedRounds.length})` : ''}
            </span>
          </button>

          {/* Nút Debug cho Host */}
          {isHost && (
            <button
              type="button"
              onClick={() => setShowDebugModal(true)}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-full text-xs font-bold bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-500/40 shadow-md cursor-pointer transition active:scale-95"
              title="Xem nhật ký & debug Bot AI (Chủ phòng)"
            >
              <span>🐞</span>
              <span className="text-[11px] hidden sm:inline">Debug</span>
            </button>
          )}

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
                isNextTurn={nextTurnPlayerId === opp.id}
                isRoundPlaying={status === 'playing'}
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
                  isNextTurn={nextTurnPlayerId === leftOpponent.id}
                  isRoundPlaying={status === 'playing'}
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
              <div className="flex flex-col items-center text-center p-3 sm:p-4 rounded-2xl bg-black/60 border border-white/10 backdrop-blur-md shadow-2xl max-w-sm w-full mx-auto">
                <span className="text-xs sm:text-sm font-extrabold text-amber-200 mb-2 flex items-center justify-center gap-1.5">
                  <Users className="w-4 h-4 text-amber-400" />
                  {players.length < 3
                    ? `Phòng chờ: ${players.length}/5 người (Cần tối thiểu 3)`
                    : `Phòng chờ: ${players.length}/5 người`}
                </span>

                {/* Danh sách người chơi và trạng thái Bắt đầu/Sẵn sàng */}
                <div className="w-full flex flex-wrap items-center justify-center gap-1.5 mb-3 max-h-32 overflow-y-auto">
                  {players.map((p) => {
                    const isMe = p.id === myPlayerId;
                    const isReady = p.isReady || p.isBot;
                    return (
                      <div
                        key={p.id}
                        className={`px-2 py-1 rounded-lg text-[11px] sm:text-xs flex items-center gap-1.5 border ${
                          isReady
                            ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                            : 'bg-slate-800/80 border-slate-700 text-slate-300'
                        }`}
                      >
                        <span className="font-semibold truncate max-w-[80px] sm:max-w-[100px]">
                          {p.name} {isMe && '(Bạn)'}
                        </span>
                        {isReady ? (
                          <span className="px-1 py-0.2 bg-emerald-500/20 text-emerald-400 font-bold rounded text-[10px]">
                            ✓ Sẵn sàng
                          </span>
                        ) : (
                          <span className="px-1 py-0.2 bg-amber-500/20 text-amber-400 font-bold rounded text-[10px] animate-pulse">
                            ⏳ Chờ bấm
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Dòng hướng dẫn quy tắc bắt đầu */}
                <p className="text-[11px] sm:text-xs text-amber-300/90 font-medium mb-3">
                  {players.length < 3
                    ? '⚠️ Cần tối thiểu 3 người chơi để bắt đầu ván mới'
                    : '👉 Cần tất cả người chơi bấm Bắt đầu để vào ván'}
                </p>

                {/* Nút bấm Bắt đầu / Sẵn sàng & Rời phòng */}
                <div className="w-full flex flex-col gap-2">
                  {!isSpectator && (
                    <button
                      type="button"
                      onClick={() => {
                        const myPlayer = players.find((p) => p.id === myPlayerId);
                        const nextReady = !myPlayer?.isReady;
                        onPlayerReady?.(nextReady);
                      }}
                      className={`w-full py-2.5 sm:py-3 rounded-xl font-extrabold text-sm sm:text-base transition shadow-xl cursor-pointer ${
                        players.find((p) => p.id === myPlayerId)?.isReady
                          ? 'bg-slate-700 hover:bg-slate-600 text-amber-300 border border-amber-400/30'
                          : 'bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:brightness-110 active:scale-95 shadow-[0_6px_20px_rgba(34,197,94,0.5)] border border-emerald-400/30 animate-pulse'
                      }`}
                    >
                      {players.find((p) => p.id === myPlayerId)?.isReady
                        ? '✓ Đã sẵn sàng (Bấm để hủy)'
                        : '▶ Bắt đầu (Sẵn sàng)'}
                    </button>
                  )}

                  {/* Nút ép bắt đầu ván cho Host nếu tất cả đã sẵn sàng */}
                  {isHost && players.length >= 3 && players.every((p) => p.isReady || p.isBot) && (
                    <button
                      type="button"
                      onClick={onStartGame}
                      className="w-full py-2 rounded-xl font-black text-xs sm:text-sm bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-lg hover:brightness-110 active:scale-95 transition cursor-pointer"
                    >
                      🚀 Bắt đầu ván ngay (Chủ phòng)
                    </button>
                  )}

                  <div className="flex items-center gap-2">
                    {/* Cụm nút Thêm / Bớt Bot AI cho Host */}
                    {isHost && (
                      <div className="flex items-center gap-1.5 flex-1">
                        {players.length < 5 && onAddBot && (
                          <button
                            type="button"
                            onClick={onAddBot}
                            className="flex-1 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold bg-indigo-600/80 hover:bg-indigo-600 text-white border border-indigo-400/30 flex items-center justify-center gap-1 active:scale-95 transition cursor-pointer"
                          >
                            <Bot className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            + Bot
                          </button>
                        )}
                        {players.some((p) => p.isBot) && onRemoveBot && (
                          <button
                            type="button"
                            onClick={() => {
                              const lastBot = [...players].reverse().find((p) => p.isBot);
                              if (lastBot) onRemoveBot(lastBot.id);
                            }}
                            className="flex-1 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold bg-rose-600/80 hover:bg-rose-600 text-white border border-rose-400/30 flex items-center justify-center gap-1 active:scale-95 transition cursor-pointer"
                          >
                            - Bot
                          </button>
                        )}
                      </div>
                    )}

                    {/* Nút Rời phòng */}
                    <button
                      type="button"
                      onClick={handleBackClick}
                      className="py-1.5 px-3 rounded-lg text-[11px] sm:text-xs font-bold bg-slate-800/90 hover:bg-rose-950/80 text-rose-300 hover:text-rose-200 border border-rose-500/30 flex items-center justify-center gap-1 active:scale-95 transition cursor-pointer ml-auto"
                    >
                      🚪 Rời phòng
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TRƯỜNG HỢP 2: BÁO SÂM (Gọn gàng trên 1 hàng duy nhất: Báo Sâm, Huỷ Sâm, Bộ đếm 60s) */}
            {status === 'sam_calling' && (
              <div className="flex flex-row items-center justify-center gap-2 sm:gap-3 flex-wrap">
                {!hasSkippedSam ? (
                  <>
                    <button
                      type="button"
                      onClick={onCallSam}
                      className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl font-black text-xs sm:text-sm text-white bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 hover:brightness-110 active:scale-95 transition shadow-[0_6px_20px_rgba(34,197,94,0.6)] border border-white/20 cursor-pointer"
                    >
                      Báo Sâm
                    </button>
                    <button
                      type="button"
                      onClick={onSkipSam}
                      className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl font-black text-xs sm:text-sm text-white bg-gradient-to-r from-red-500 via-rose-500 to-red-600 hover:brightness-110 active:scale-95 transition shadow-[0_6px_20px_rgba(239,68,68,0.6)] border border-white/20 cursor-pointer"
                    >
                      Huỷ Sâm
                    </button>
                  </>
                ) : (
                  <div className="px-3.5 py-1.5 rounded-xl font-bold text-xs text-slate-200 bg-slate-900/90 border border-emerald-500/40 shadow-xl flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Đã huỷ Báo Sâm
                  </div>
                )}

                {/* BỘ ĐẾM 60S TRÊN CÙNG HÀNG */}
                {samSecondsLeft !== null && (
                  <div className="px-3 py-1.5 rounded-xl bg-black/70 border border-amber-400/40 flex items-center gap-1.5 shadow-lg">
                    <span className="text-[11px] font-bold text-amber-300">
                      ⏳ Tự huỷ sau:
                    </span>
                    <span className="text-xs sm:text-sm font-black font-mono text-yellow-400 animate-pulse">
                      {samSecondsLeft}s
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* CỤM BÀI VỪA ĐÁNH (TỐI ĐA 2 LƯỢT ĐÈ NHAU) & CẶP NÚT CHO QUA / ĐÁNH HAI BÊN */}
            <div className="flex items-center justify-center gap-2 sm:gap-6 my-auto z-20 w-full">
              {/* Nút Cho Qua ở bên trái bài đánh (Chuẩn ảnh mẫu ZingPlay) */}
              {isMyTurn && status === 'playing' && !isSpectator && (
                <button
                  type="button"
                  onClick={handlePassClick}
                  disabled={!canPass}
                  className={`w-20 sm:w-28 md:w-32 py-2 sm:py-3 rounded-xl font-black text-xs sm:text-base text-white transition shadow-xl shrink-0 cursor-pointer ${
                    canPass
                      ? 'bg-[#e24c4c] hover:bg-[#d63031] active:scale-95 shadow-[0_6px_20px_rgba(226,76,76,0.6)] border border-white/20'
                      : 'bg-slate-700/60 text-slate-400 opacity-50 cursor-not-allowed'
                  }`}
                >
                  Cho Qua
                </button>
              )}

              {/* CỤM BÀI ĐÁNH GỒM TỐI ĐA 2 LƯỢT ĐÈ NHAU: BẤM VÀO ĐỂ XEM LỊCH SỬ ĐÁNH BÀI */}
              <div className="relative flex flex-col items-center justify-center min-w-0">
                {/* Bộ đếm 30s khi tới lượt bạn */}
                {isMyTurn && status === 'playing' && !isSpectator && turnSecondsLeft !== null && (
                  <div className="mb-2">
                    <div
                      className={`px-3 py-0.5 rounded-full font-black text-xs sm:text-sm font-mono shadow-lg border flex items-center gap-1.5 ${
                        turnSecondsLeft <= 5
                          ? 'bg-red-600 text-white border-white animate-bounce'
                          : 'bg-emerald-500 text-slate-950 border-emerald-300'
                      }`}
                    >
                      ⏱️ {turnSecondsLeft}s
                    </div>
                  </div>
                )}

                {/* Nhãn gợi ý nước đi tối ưu từ Bot AI khi bật gợi ý và chưa chọn bài */}
                {isAiHintEnabled && isMyTurn && status === 'playing' && !isSpectator && selectedCardIds.length === 0 && suggestedDecision?.action === 'PLAY' && suggestedDecision.reason && (
                  <div className="mb-2 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setSelectedCardIds(suggestedCardIds)}
                      className="px-2.5 py-1 rounded-full bg-amber-500/25 hover:bg-amber-500/35 border border-amber-400/50 text-amber-300 text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow cursor-pointer max-w-[85vw] truncate animate-fade-in"
                      title="Nhấn để tự động chọn các lá bài AI gợi ý"
                    >
                      <span className="truncate">💡 AI: {suggestedDecision.reason}</span>
                      <span className="text-[10px] underline font-bold text-amber-200 shrink-0">(Chọn bài)</span>
                    </button>
                  </div>
                )}

                {status === 'playing' && currentRecentPlays.length > 0 && (
                  <div
                    onClick={() => setShowPlayHistoryModal(true)}
                    className="relative flex flex-col items-center justify-center cursor-pointer group p-1 rounded-xl transition hover:brightness-105 active:scale-95 scale-80 sm:scale-85 md:scale-90 origin-center"
                    title="Bấm để xem toàn bộ lịch sử đánh bài của ván này"
                  >
                    {/* Hàng 1 (lượt cũ hơn): nằm phía trên lùi lại, mờ nhẹ */}
                    {currentRecentPlays.length === 2 && (
                      <div className="flex items-center justify-center -mb-14 sm:-mb-18 md:-mb-22 opacity-85 transition-all z-10 drop-shadow-md pointer-events-none">
                        {currentRecentPlays[0].combo.cards.map((c, idx) => (
                          <div
                            key={`prev_${c.id}`}
                            className={idx > 0 ? '-ml-9 sm:-ml-12 md:-ml-15' : ''}
                            style={{ zIndex: 10 + idx }}
                          >
                            <LocCard card={c} size="md" className="shadow-lg filter brightness-90" />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Hàng 2 (lượt mới nhất): nằm đè lên hàng 1, to rõ nét */}
                    <div className="flex items-center justify-center z-20 drop-shadow-[0_16px_30px_rgba(0,0,0,0.85)]">
                      {currentRecentPlays[currentRecentPlays.length - 1].combo.cards.map((c, idx) => (
                        <div
                          key={`curr_${c.id}`}
                          className={idx > 0 ? '-ml-9 sm:-ml-12 md:-ml-15' : ''}
                          style={{ zIndex: 20 + idx }}
                        >
                          <LocCard card={c} size="md" className="shadow-2xl" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Nút Đánh ở bên phải bài đánh (Chuẩn ảnh mẫu ZingPlay) */}
              {isMyTurn && status === 'playing' && !isSpectator && (
                <button
                  type="button"
                  onClick={handlePlayClick}
                  disabled={!canPlay}
                  className={`w-20 sm:w-28 md:w-32 py-2 sm:py-3 rounded-xl font-black text-xs sm:text-base transition shadow-xl shrink-0 cursor-pointer ${
                    canPlay
                      ? 'bg-[#22c55e] hover:bg-[#16a34a] text-white active:scale-95 shadow-[0_6px_20px_rgba(34,197,94,0.7)] border border-white/20 ring-2 ring-emerald-300 animate-pulse'
                      : 'bg-[#546e7a] text-slate-300 opacity-60 cursor-not-allowed border border-white/10'
                  }`}
                >
                  Đánh
                </button>
              )}
            </div>
</div>

          {/* Đối thủ bên phải (Tự thu nhỏ khi màn hình hẹp) */}
          <div className="shrink-0 w-16 sm:w-28 md:w-32 flex justify-end">
            {rightOpponent && (
              <div className="scale-75 sm:scale-100 origin-right">
                <LocOpponent
                  player={rightOpponent}
                  isCurrentTurn={currentTurnPlayerId === rightOpponent.id}
                  isNextTurn={nextTurnPlayerId === rightOpponent.id}
                  isRoundPlaying={status === 'playing'}
                  turnSecondsLeft={currentTurnPlayerId === rightOpponent.id ? turnSecondsLeft : null}
                  cardPosition="left"
                />
              </div>
            )}
          </div>
        </div>

        <div className="w-full shrink-0">
          <LocHand
            hand={myHand}
            tableCombo={lastPlay?.combo ?? null}
            isMyTurn={isMyTurn}
            selectedCardIds={selectedCardIds}
            onSelectionChange={setSelectedCardIds}
            disabled={status !== 'playing' || !isMyTurn || isSpectator}
            playerName={myPlayer?.name || 'You'}
            dimHintCardIds={isAiHintEnabled && isMyTurn ? suggestedCardIds : []}
            isAiHintEnabled={isAiHintEnabled}
            turnSecondsLeft={isMyTurn ? turnSecondsLeft : null}
            hasPassed={status === 'playing' && Boolean(myPlayer?.hasPassed)}
            isNextTurn={nextTurnPlayerId === myPlayerId}
          />
        </div>
      </div>

      {/* POPUP TỔNG KẾT VÁN ĐẤU (Nằm trong container để xoay đồng bộ 100%) */}
      {status === 'round_ended' && tableState.roundResult && (
        <LocRoundOverModal
          scoreboard={tableState.roundResult}
          isHost={isHost}
          onNextRound={onNextRound || (() => {})}
          onEndRoundToWaiting={onEndRoundToWaiting}
          onLeaveRoom={onLeaveRoom}
        />
      )}

      {/* POPUP SỔ NỢ & LỊCH SỬ CÁC VÁN TRONG PHÒNG */}
      {showScoreHistory && (
        <LocScoreHistoryModal
          tableState={tableState}
          onClose={() => setShowScoreHistory(false)}
        />
      )}

      {/* POPUP DEBUG NHẬT KÝ ĐÁNH BÀI CHO HOST */}
      {showDebugModal && (
        <LocDebugModal
          roomId={tableState.roomId}
          onClose={() => setShowDebugModal(false)}
        />
      )}

      {/* POPUP LỊCH SỬ ĐÁNH BÀI VÁN HIỆN TẠI */}
      {showPlayHistoryModal && (
        <LocPlayHistoryModal
          records={tableState.roundPlayRecords || []}
          onClose={() => setShowPlayHistoryModal(false)}
        />
      )}

      {/* MODAL XÁC NHẬN KHI ẤN "TRỞ VỀ" */}
      {confirmExitType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-sm w-full p-5 shadow-2xl flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl mb-3">
              {confirmExitType === 'to_waiting' ? '⏸️' : '🚪'}
            </div>

            <h3 className="font-black text-base sm:text-lg text-white mb-1.5">
              {confirmExitType === 'to_waiting' ? 'Quay về phòng chờ?' : 'Rời khỏi phòng?'}
            </h3>

            <p className="text-xs sm:text-sm text-slate-300 mb-5 leading-relaxed">
              {confirmExitType === 'to_waiting'
                ? 'Bạn có chắc chắn muốn dừng ván đấu hiện tại và đưa mọi người quay về phòng chờ?'
                : 'Bạn có chắc chắn muốn rời khỏi phòng chơi này và quay ra danh sách phòng?'}
            </p>

            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={() => setConfirmExitType(null)}
                className="flex-1 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmExit}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white transition cursor-pointer ${
                  confirmExitType === 'to_waiting'
                    ? 'bg-amber-600 hover:bg-amber-500'
                    : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                Đồng ý
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
