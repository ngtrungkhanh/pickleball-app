'use client';

import React, { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
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
  Settings,
  X,
  BarChart3,
  History,
  FileText,
} from 'lucide-react';

interface LocGameBoardProps {
  tableState: TableState;
  myPlayerId: string;
  myHand: Card[];
  isSpectator: boolean;
  onPlayCards: (cards: Card[]) => void;
  onPassTurn: () => void;
  onHistoryViewChange?: (isOpen: boolean) => void;
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
  onHistoryViewChange,
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
  const [showScoreHistory, setShowScoreHistory] = useState(false);
  const [showPlayHistoryModal, setShowPlayHistoryModal] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<HTMLDivElement>(null);
  const selectedOriginRef = useRef<{ x: number; y: number } | null>(null);
  const handOriginsRef = useRef(new Map<string, { x: number; y: number; isRotated: boolean }>());
  const historyCallbackRef = useRef(onHistoryViewChange);
  const passCallbackRef = useRef(onPassTurn);
  const autoPassRef = useRef({ remainingMs: 1500 });
  useEffect(() => {
    historyCallbackRef.current = onHistoryViewChange;
    passCallbackRef.current = onPassTurn;
  }, [onHistoryViewChange, onPassTurn]);
  useEffect(() => {
    if (!isSpectator) historyCallbackRef.current?.(showPlayHistoryModal);
  }, [showPlayHistoryModal, isSpectator]);
  useEffect(() => () => { historyCallbackRef.current?.(false); }, []);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [showRoundOverModal, setShowRoundOverModal] = useState(false);
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
  const showPlayHistoryModalRef = useRef(showPlayHistoryModal);
  const showScoreHistoryRef = useRef(showScoreHistory);
  const showDebugModalRef = useRef(showDebugModal);
  const showRoundOverModalRef = useRef(showRoundOverModal);
  const statusRef = useRef(tableState.status);
  const isExitingRef = useRef(false);

  useEffect(() => {
    confirmExitTypeRef.current = confirmExitType;
    showSettingsModalRef.current = showSettingsModal;
    showPlayHistoryModalRef.current = showPlayHistoryModal;
    showScoreHistoryRef.current = showScoreHistory;
    showDebugModalRef.current = showDebugModal;
    showRoundOverModalRef.current = showRoundOverModal;
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
    window.history.pushState({ inLocGameRoom: true }, '');

    const handlePopState = () => {
      if (isExitingRef.current) return;
      window.history.pushState({ inLocGameRoom: true }, '');

      if (confirmExitTypeRef.current) {
        setConfirmExitType(null);
        return;
      }
      if (showSettingsModalRef.current) {
        setShowSettingsModal(false);
        return;
      }
      if (showRoundOverModalRef.current) {
        setShowRoundOverModal(false);
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

      if (statusRef.current !== 'waiting') {
        setConfirmExitType('to_waiting');
        return;
      }

      setConfirmExitType('leave_room');
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const [now, setNow] = useState<number>(() => Date.now());

  // TỰ ĐỘNG XOAY NGANG 90 ĐỘ KHI MÀN HÌNH DỌC
  const [isRotated, setIsRotated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      if (window.innerWidth >= window.innerHeight) {
        return false;
      }
      const manualPref = sessionStorage.getItem('loc_manual_rotate_pref');
      if (manualPref !== null) return manualPref === 'true';
      return true;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      const isLandscape = window.innerWidth >= window.innerHeight;
      if (isLandscape) {
        setIsRotated(false);
        sessionStorage.removeItem('loc_manual_rotate_pref');
      } else {
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

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    if (isRotated) {
      document.body.style.touchAction = 'none';
    } else {
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

  const currentRecentPlays = useMemo(() => {
    if (status !== 'playing' && status !== 'round_ended') return [];
    if (recentPlays && recentPlays.length > 0) return recentPlays;
    if (lastPlay) return [lastPlay];
    return [];
  }, [status, recentPlays, lastPlay]);

  const isHost = players.find((p) => p.id === myPlayerId)?.isHost ?? false;
  const isMyTurn = currentTurnPlayerId === myPlayerId && status === 'playing';
  const isPaused = Boolean(tableState.historyPause) || (showPlayHistoryModal && !isSpectator && status === 'playing');
  const myPlayer = players.find((p) => p.id === myPlayerId);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const turnSecondsLeft = useMemo(() => {
    if (tableState.historyPause) return Math.ceil(tableState.historyPause.remainingTurnMs / 1000);
    if (status !== 'playing' || !turnDeadline) return null;
    return Math.max(0, Math.ceil((turnDeadline - now) / 1000));
  }, [status, turnDeadline, now, tableState.historyPause]);

  const samSecondsLeft = useMemo(() => {
    if (status !== 'sam_calling' || !samState?.deadline) return null;
    return Math.max(0, Math.ceil((samState.deadline - now) / 1000));
  }, [status, samState, now]);

  const hasSkippedSam = useMemo(() => {
    return Boolean(samState?.skipPlayerIds?.includes(myPlayerId));
  }, [samState, myPlayerId]);

  useEffect(() => {
    if (status === 'sam_calling' && samState?.deadline && now >= samState.deadline) {
      onSkipSam();
    }
  }, [status, samState?.deadline, now, onSkipSam]);

  const cannotBeat = useMemo(() => {
    if (!isMyTurn || isSpectator || status !== 'playing' || !lastPlay) return false;
    return !hasAnyPlayableMove(myHand, lastPlay.combo);
  }, [isMyTurn, isSpectator, status, lastPlay, myHand]);

  useEffect(() => {
    const autoPass = autoPassRef.current;
    if (!cannotBeat) {
      autoPass.remainingMs = 1500;
      return;
    }
    if (isPaused) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      autoPass.remainingMs = 1500;
      passCallbackRef.current();
    }, autoPass.remainingMs);
    return () => {
      clearTimeout(timer);
      autoPass.remainingMs = Math.max(0, autoPass.remainingMs - (Date.now() - startedAt));
    };
  }, [cannotBeat, isPaused, currentTurnPlayerId, lastPlay]);

  const botBrain = useMemo(() => new BotBrain(), []);

  useEffect(() => {
    if (lastPlay?.combo?.cards) {
      botBrain.getTracker().recordPlay(lastPlay.combo.cards);
    }
  }, [lastPlay, botBrain]);

  useEffect(() => {
    if (status === 'sam_calling' || status === 'waiting') {
      botBrain.getTracker().reset();
    }
  }, [status, botBrain]);

  const suggestedDecision = useMemo(() => {
    if (!isMyTurn || isSpectator || status !== 'playing') return null;
    return botBrain.decideMove(myPlayerId, myHand, tableState);
  }, [isMyTurn, isSpectator, status, botBrain, myPlayerId, myHand, tableState]);

  const suggestedCardIds = useMemo(() => {
    if (!suggestedDecision || suggestedDecision.action !== 'PLAY') return [];
    return suggestedDecision.cards.map((c) => c.id);
  }, [suggestedDecision]);

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

  const opponents = useMemo(() => {
    return players.filter((p) => p.id !== myPlayerId);
  }, [players, myPlayerId]);

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

  const selectedCards = useMemo(() => {
    const idSet = new Set(selectedCardIds);
    return myHand.filter((c) => idSet.has(c.id));
  }, [myHand, selectedCardIds]);

  const selectedCombo = useMemo(() => {
    return analyzeCombo(selectedCards);
  }, [selectedCards]);

  const canPlay = useMemo(() => {
    if (!isMyTurn || isPaused || isSpectator || selectedCombo.type === 'INVALID') {
      return false;
    }
    if (!lastPlay) {
      return true;
    }
    return canBeat(selectedCombo, lastPlay.combo);
  }, [isMyTurn, isPaused, isSpectator, selectedCombo, lastPlay]);

  const canPass = useMemo(() => {
    if (!isMyTurn || isPaused || isSpectator) return false;
    if (roundLeaderPlayerId === myPlayerId || !lastPlay) return false;
    return true;
  }, [isMyTurn, isPaused, isSpectator, roundLeaderPlayerId, myPlayerId, lastPlay]);

  const handlePlayClick = () => {
    if (canPlay) {
      const cards = [...(boardRef.current?.querySelectorAll<HTMLElement>('[data-card-id]') ?? [])]
        .filter(element => element.classList.contains('loc-hand-card') && selectedCardIds.includes(element.dataset.cardId!))
        .map(element => element.getBoundingClientRect());
      if (cards.length) selectedOriginRef.current = {
        x: (Math.min(...cards.map(card => card.left)) + Math.max(...cards.map(card => card.right))) / 2,
        y: (Math.min(...cards.map(card => card.top)) + Math.max(...cards.map(card => card.bottom))) / 2,
      };
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

  const sourcePlayerId = lastPlay?.playerId;
  const playKey = lastPlay ? `${lastPlay.playerId}:${lastPlay.combo.cards.map(card => card.id).join(',')}` : '';
  useLayoutEffect(() => {
    const target = playRef.current;
    const source = [...(boardRef.current?.querySelectorAll<HTMLElement>('[data-hand-player-id]') ?? [])]
      .find(element => element.dataset.handPlayerId === sourcePlayerId);
    if (!target?.animate || !source || !sourcePlayerId) return;
    const targetRect = target.getBoundingClientRect();
    const sourceRect = source.getBoundingClientRect();
    const origin = sourcePlayerId === myPlayerId && selectedOriginRef.current
      ? selectedOriginRef.current
      : status === 'round_ended' && handOriginsRef.current.get(sourcePlayerId)?.isRotated === isRotated
        ? handOriginsRef.current.get(sourcePlayerId)!
        : { x: sourceRect.left + sourceRect.width / 2, y: sourceRect.top + sourceRect.height / 2 };
    selectedOriginRef.current = null;
    const screenX = origin.x - (targetRect.left + targetRect.width / 2);
    const screenY = origin.y - (targetRect.top + targetRect.height / 2);
    const scale = (isRotated ? targetRect.height : targetRect.width) / target.offsetWidth || 1;
    const x = (isRotated ? screenY : screenX) / scale;
    const y = (isRotated ? -screenX : screenY) / scale;
    const animation = target.animate([
      { transform: `translate(${x}px, ${y}px) rotate(${Math.max(-18, Math.min(18, x / 20))}deg) scale(0.65)` },
      { transform: 'translate(0, 0) rotate(0) scale(1)' },
    ], { duration: 500, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' });
    return () => animation.cancel();
  }, [playKey, sourcePlayerId, isRotated, myPlayerId, status]);

  // Save the hand positions before the next play can replace a winner's hand
  // with the end-of-round badge. The final card still flies from that hand.
  useLayoutEffect(() => {
    handOriginsRef.current.clear();
    boardRef.current?.querySelectorAll<HTMLElement>('[data-hand-player-id]').forEach(element => {
      const rect = element.getBoundingClientRect();
      handOriginsRef.current.set(element.dataset.handPlayerId!, {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        isRotated,
      });
    });
  }, [players, myHand, isRotated, status]);

  const rotateControl = (
    <button
      type="button"
      onClick={handleToggleRotate}
      className={`flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-bold transition shadow-md cursor-pointer active:scale-95 ${
        isRotated
          ? 'bg-amber-400 text-slate-950 border border-amber-200'
          : 'bg-black/60 hover:bg-black/80 text-amber-300 border border-amber-400/40'
      }`}
      title="Xoay ngang 90 độ bàn chơi"
    >
      <RotateCcw className={`w-3.5 h-3.5 transition-transform duration-200 ${isRotated ? 'rotate-90' : ''}`} />
      <span className="text-[11px] sm:text-xs font-mono font-bold">{isRotated ? '90°' : 'Xoay'}</span>
    </button>
  );


  return (
    <div
      ref={boardRef}
      className={`loc-game-board ${status === 'round_ended' ? 'loc-round-ended' : ''} relative bg-[#0b1a2d] overflow-hidden select-none font-sans flex flex-col justify-between`}
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
              position: 'fixed',
              top: 0,
              left: 0,
              zIndex: 40,
              width: '100%',
              height: '100dvh',
            }
      }
    >
      <style jsx global>{`
        .loc-game-board {
          container-type: size;
          --loc-hand-card-width: clamp(80px, 10cqw, 144px);
        }
        .loc-hand-card { width: var(--loc-hand-card-width); }
        @container (max-height: 500px) {
          .loc-hand-card { height: 88px; aspect-ratio: auto; }
          .loc-self-portrait { width: 32px; height: 32px; }
          .loc-opponent-avatar { width: 64px; }
          .loc-opponent-portrait { width: 32px; height: 32px; }
          .loc-opponent-back { width: 44px; }
          .loc-side-seat { position: absolute; top: 48%; transform: translateY(-50%); }
          .loc-side-seat-left { left: 12px; }
          .loc-side-seat-right { right: 12px; }
          .loc-table-middle { position: static; }
          .loc-table-play { transform: translateY(24px) scale(0.8); }
          .loc-table-play .loc-table-card { width: 54px; }
          .loc-table-card-slot + .loc-table-card-slot { margin-left: -28px; }
          .loc-table-previous { margin-bottom: -42px; }
          .loc-revealed-hand { width: 116px; grid-template-columns: repeat(4, minmax(0, 1fr)) 36px; }
          .loc-revealed-card { width: 36px; height: 34px; padding: 3px; }
          .loc-revealed-card span { font-size: 12px; }
          .loc-revealed-card > div:last-child { display: none; }
          .loc-round-ended .loc-opponent-portrait { width: 16px; height: 16px; }
          .loc-round-ended .loc-side-seat { top: 55%; }
        }
      `}</style>

      {/* BÀN CHƠI HÌNH OVAL NỈ ĐỎ MẬN CHÍN VỚI VIỀN GỖ BO TRÒN FULL 100% VIEWPORT */}
      <div className="relative w-full h-full flex flex-col items-center justify-between p-1 sm:p-2 md:p-3 rounded-[24px] sm:rounded-[50px] md:rounded-[80px] border-[6px] sm:border-[10px] md:border-[14px] border-[#92400e]/95 bg-gradient-to-br from-[#741838] via-[#591029] to-[#3f0b1c] shadow-[inset_0_0_60px_rgba(0,0,0,0.85),0_20px_45px_rgba(0,0,0,0.95)] overflow-hidden">
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

        {/* 1. CỤM NÚT BACK VÀ TIÊU ĐỀ BÀN (NẰM BÊN TRONG BÀN NỈ Ở GÓC TRÊN BÊN TRÁI) */}
        <div className="absolute top-2 sm:top-3 left-2 sm:left-4 z-30 flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={handleBackClick}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#4a1024]/90 hover:bg-[#5e162f] border border-white/20 flex items-center justify-center text-white shadow-lg active:scale-95 transition cursor-pointer"
            title="Rời bàn"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <div className="max-w-[40cqw] px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-black/60 border border-white/10 backdrop-blur-sm shadow-md">
            <span className="block truncate text-[11px] sm:text-xs md:text-sm font-extrabold text-amber-200">
              Bàn: {roomName}
            </span>
          </div>
        </div>

        {/* 2. CỤM ĐIỀU KHIỂN GÓC TRÊN BÊN PHẢI: CHỈ CÒN 2 NÚT (XOAY & CÀI ĐẶT) */}
        <div className="absolute top-2 sm:top-3 right-2 sm:right-4 z-30 flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          {isSpectator && (
            <span className="text-[10px] sm:text-xs font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 px-2 py-0.5 sm:py-1 rounded-full">
              Khán giả
            </span>
          )}

          {/* Nút Cài đặt (Mở Modal gom tất cả tiện ích) */}
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 flex items-center justify-center shadow-lg active:scale-95 transition cursor-pointer"
            title="Cài đặt & Tiện ích"
          >
            <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-slate-200" />
          </button>
        </div>

        {/* --- ĐỐI THỦ PHÍA TRÊN --- */}
        <div className={`absolute top-14 sm:top-16 inset-x-0 z-20 flex items-center gap-4 sm:gap-6 ${topOpponents.length === 2 ? 'justify-between px-[16%]' : 'justify-center'}`}>
          {topOpponents.map((opp, index) =>
            opp && opp.id ? (
              <LocOpponent
                key={opp.id}
                player={opp}
                isCurrentTurn={currentTurnPlayerId === opp.id}
                isNextTurn={nextTurnPlayerId === opp.id}
                isRoundPlaying={status === 'playing'}
                turnSecondsLeft={currentTurnPlayerId === opp.id ? turnSecondsLeft : null}
                cardPosition={index === 1 ? 'left' : 'right'}
                isRoundEnded={status === 'round_ended'}
                remainingCards={tableState.remainingHands ? tableState.remainingHands[opp.id] : null}
                scoreDetail={tableState.roundResult ? tableState.roundResult[opp.id] : null}
              />
            ) : null
          )}
        </div>

        {/* --- KHU VỰC GIỮA BÀN: ĐỐI THỦ HAI BÊN & BÀI VỪA ĐÁNH --- */}
        <div className="loc-table-middle w-full flex-1 flex items-center justify-between px-1 sm:px-4 relative z-20 min-h-0 my-auto">
          {/* Đối thủ bên trái */}
          <div className="loc-side-seat loc-side-seat-left shrink-0 w-16 sm:w-28 md:w-32 flex justify-start">
            {leftOpponent && (
              <div className="scale-75 sm:scale-100 origin-left">
                <LocOpponent
                  player={leftOpponent}
                  isCurrentTurn={currentTurnPlayerId === leftOpponent.id}
                  isNextTurn={nextTurnPlayerId === leftOpponent.id}
                  isRoundPlaying={status === 'playing'}
                  turnSecondsLeft={currentTurnPlayerId === leftOpponent.id ? turnSecondsLeft : null}
                  cardPosition="right"
                  isRoundEnded={status === 'round_ended'}
                  remainingCards={tableState.remainingHands ? tableState.remainingHands[leftOpponent.id] : null}
                  scoreDetail={tableState.roundResult ? tableState.roundResult[leftOpponent.id] : null}
                />
              </div>
            )}
          </div>

          {/* VÙNG CHÍNH GIỮA BÀN: BÀI VỪA ĐÁNH / TRẠNG THÁI PHÒNG */}
          <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto px-1 min-h-0">
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

                <p className="text-[11px] sm:text-xs text-amber-300/90 font-medium mb-3">
                  {players.length < 3
                    ? '⚠️ Cần tối thiểu 3 người chơi để bắt đầu ván mới'
                    : '👉 Cần tất cả người chơi bấm Bắt đầu để vào ván'}
                </p>

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

            {/* TRƯỜNG HỢP 3: CỤM BÀI VỪA ĐÁNH Ở GIỮA BÀN (CÓ ANIMATION LIA BÀI RA GIỮA) */}
            {currentRecentPlays.length > 0 && (
              <div
                onClick={() => setShowPlayHistoryModal(true)}
                className="loc-table-play relative flex flex-col items-center justify-center cursor-pointer group p-1 rounded-xl transition hover:brightness-105 active:scale-95 scale-80 sm:scale-85 md:scale-90 origin-center"
                title="Bấm để xem toàn bộ lịch sử đánh bài của ván này"
              >
                {/* Hàng 1 (lượt cũ hơn): nằm phía trên lùi lại, mờ nhẹ */}
                {currentRecentPlays.length === 2 && (
                  <div className="loc-table-previous flex items-center justify-center -mb-14 sm:-mb-18 md:-mb-22 opacity-85 transition-all z-10 drop-shadow-md pointer-events-none">
                    {currentRecentPlays[0].combo.cards.map((c, idx) => (
                      <div
                        key={`prev_${c.id}`}
                        className={`loc-table-card-slot ${idx > 0 ? '-ml-9 sm:-ml-12 md:-ml-15' : ''}`}
                        style={{ zIndex: 10 + idx }}
                      >
                        <LocCard card={c} size="md" className="loc-table-card shadow-lg filter brightness-90" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Hàng 2 (lượt mới nhất): bài bay từ phía người đánh ra giữa bàn */}
                <div
                  key={lastPlay ? `play_${lastPlay.playerId}_${lastPlay.combo.cards.map((c) => c.id).join('_')}` : 'play_cur'}
                  ref={playRef}
                  className="flex items-center justify-center z-20 drop-shadow-[0_16px_30px_rgba(0,0,0,0.85)]"
                >
                  {currentRecentPlays[currentRecentPlays.length - 1].combo.cards.map((c, idx) => (
                    <div
                      key={`curr_${c.id}`}
                      className={`loc-table-card-slot ${idx > 0 ? '-ml-9 sm:-ml-12 md:-ml-15' : ''}`}
                      style={{ zIndex: 20 + idx }}
                    >
                      <LocCard card={c} size="md" className="loc-table-card shadow-2xl" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Đối thủ bên phải */}
          <div className="loc-side-seat loc-side-seat-right shrink-0 w-16 sm:w-28 md:w-32 flex justify-end">
            {rightOpponent && (
              <div className="scale-75 sm:scale-100 origin-right">
                <LocOpponent
                  player={rightOpponent}
                  isCurrentTurn={currentTurnPlayerId === rightOpponent.id}
                  isNextTurn={nextTurnPlayerId === rightOpponent.id}
                  isRoundPlaying={status === 'playing'}
                  turnSecondsLeft={currentTurnPlayerId === rightOpponent.id ? turnSecondsLeft : null}
                  cardPosition="left"
                  isRoundEnded={status === 'round_ended'}
                  remainingCards={tableState.remainingHands ? tableState.remainingHands[rightOpponent.id] : null}
                  scoreDetail={tableState.roundResult ? tableState.roundResult[rightOpponent.id] : null}
                />
              </div>
            )}
          </div>
        </div>

        {/* --- KHU VỰC DƯỚI BÀN: NÚT THAO TÁC VÀ DÃY BÀI NGƯỜI CHƠI --- */}
        <div className="w-full shrink-0 flex flex-col items-center">
          <div className={status === 'waiting' ? 'contents' : 'w-full min-h-[80px] sm:min-h-[90px] flex items-start justify-center'}>
            {/* TRƯỜNG HỢP 2: BÁO SÂM */}
            {status === 'sam_calling' && (
              <div className="flex min-h-11 items-center justify-center gap-2 sm:gap-3 mb-9 sm:mb-11 z-30">
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

            {/* Chừa khoảng trống cho độ nhô và viền sáng của lá được chọn. */}
            {status === 'playing' && isMyTurn && !isSpectator && (
              <div className="flex items-center justify-center gap-2 sm:gap-4 mb-9 sm:mb-11 z-30 pointer-events-auto">
                {/* Không yêu cầu thao tác khi không có bài chặn. */}
                {!cannotBeat && (
                  <button
                    type="button"
                    onClick={handlePassClick}
                    disabled={!canPass}
                    className={`w-20 sm:w-28 md:w-32 py-1.5 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-xs sm:text-base text-white transition shadow-lg shrink-0 cursor-pointer ${
                      canPass
                        ? 'bg-[#e24c4c] hover:bg-[#d63031] active:scale-95 shadow-[0_4px_16px_rgba(226,76,76,0.6)] border border-white/20'
                        : 'bg-slate-700/60 text-slate-400 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    Cho Qua
                  </button>
                )}

                {/* Bộ đếm giây 30s của turn ở chính giữa */}
                {turnSecondsLeft !== null && (
                  <div
                    className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full font-black text-xs sm:text-sm font-mono shadow-xl border-2 flex items-center gap-1 shrink-0 ${
                      turnSecondsLeft <= 5
                        ? 'bg-red-600 text-white border-white animate-bounce shadow-[0_0_15px_rgba(239,68,68,0.9)]'
                        : 'bg-emerald-500 text-slate-950 border-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.7)]'
                    }`}
                  >
                    <span>⏱️</span>
                    <span>{turnSecondsLeft}s</span>
                  </div>
                )}

                {/* Nút Đánh */}
                {!cannotBeat && (
                  <button
                    type="button"
                    onClick={handlePlayClick}
                    disabled={!canPlay}
                    className={`w-20 sm:w-28 md:w-32 py-1.5 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-xs sm:text-base transition shadow-lg shrink-0 cursor-pointer ${
                      canPlay
                        ? 'bg-[#22c55e] hover:bg-[#16a34a] text-white active:scale-95 shadow-[0_4px_16px_rgba(34,197,94,0.7)] border border-white/20 ring-2 ring-emerald-300 animate-pulse'
                        : 'bg-[#546e7a] text-slate-300 opacity-60 cursor-not-allowed border border-white/10'
                    }`}
                  >
                    Đánh
                  </button>
                  )}
              </div>
            )}

            {/* KHI KẾT THÚC VÁN: VỊ TRÍ 2 NÚT BIẾN THÀNH [VÁN MỚI] VÀ [VỀ PHÒNG CHỜ] */}
            {status === 'round_ended' && (
              <div className="flex items-center justify-center gap-2 sm:gap-4 mb-9 sm:mb-11 z-30 pointer-events-auto animate-fade-in">
                <button
                  type="button"
                  onClick={onNextRound}
                  className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-[0_4px_20px_rgba(34,197,94,0.7)] border border-emerald-300 hover:brightness-110 active:scale-95 transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>▶</span>
                  <span>{isHost ? 'Ván Mới (Chủ phòng)' : 'Sẵn Sàng Ván Mới'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmExitType('to_waiting')}
                  className="px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-extrabold text-xs sm:text-sm bg-slate-800/90 hover:bg-slate-700 text-amber-200 border border-slate-600 active:scale-95 transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>⏸️</span>
                  <span>Về Phòng Chờ</span>
                </button>
              </div>
            )}

          </div>
          {/* DÃY BÀI TRÊN TAY CỦA NGƯỜI CHƠI */}
          <div className="w-full">
            <LocHand
              playerId={myPlayerId}
              trailingControl={rotateControl}
              hand={myHand}
              tableCombo={lastPlay?.combo ?? null}
              isMyTurn={isMyTurn}
              selectedCardIds={status === 'playing' ? selectedCardIds : []}
              onSelectionChange={setSelectedCardIds}
              disabled={status !== 'playing' || !isMyTurn || isPaused || isSpectator}
              playerName={myPlayer?.name || 'You'}
              dimHintCardIds={isAiHintEnabled && isMyTurn ? suggestedCardIds : []}
              isAiHintEnabled={isAiHintEnabled}
              turnSecondsLeft={isMyTurn ? turnSecondsLeft : null}
              hasPassed={status === 'playing' && Boolean(myPlayer?.hasPassed)}
              isNextTurn={nextTurnPlayerId === myPlayerId}
              isRoundEnded={status === 'round_ended'}
              scoreDetail={tableState.roundResult ? tableState.roundResult[myPlayerId] : null}
            />
          </div>
        </div>
      </div>

      {tableState.historyPause && !showPlayHistoryModal && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 rounded-xl border border-amber-400/40 bg-slate-950/95 px-4 py-3 text-center text-xs font-bold text-amber-200 shadow-xl">
          Tạm dừng · {players.filter(player => tableState.historyPause!.viewerIds.includes(player.id)).map(player => player.name).join(', ')} đang xem lịch sử
        </div>
      )}

      {/* POPUP TỔNG KẾT VÁN ĐẤU (CHỈ HIỆN KHI NGƯỜI DÙNG BẤM XEM TỪ CÀI ĐẶT) */}
      {showRoundOverModal && tableState.roundResult && (
        <LocRoundOverModal
          scoreboard={tableState.roundResult}
          isHost={isHost}
          onNextRound={() => {
            setShowRoundOverModal(false);
            onNextRound?.();
          }}
          onEndRoundToWaiting={() => {
            setShowRoundOverModal(false);
            onEndRoundToWaiting?.();
          }}
          onLeaveRoom={() => {
            setShowRoundOverModal(false);
            onLeaveRoom();
          }}
        />
      )}

      {/* MODAL CÀI ĐẶT & TIỆN ÍCH (GOM TẤT CẢ TÍNH NĂNG PHỤ VÀO ĐÂY) */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-sm w-full p-5 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-black text-base sm:text-lg text-amber-300 flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-400" />
                Cài đặt & Tiện ích
              </h3>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              {/* Toggle Gợi ý AI */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/70 border border-slate-800">
                <div className="flex items-center gap-2.5">
                  <Lightbulb className={`w-5 h-5 ${isAiHintEnabled ? 'text-amber-400 fill-amber-400' : 'text-slate-500'}`} />
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-white">Gợi ý bài AI</div>
                    <div className="text-[10px] text-slate-400">Sáng các lá bài bot khuyên đánh</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleAiHint}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                    isAiHintEnabled ? 'bg-amber-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform transform ${
                      isAiHintEnabled ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Nút Xem Sổ Nợ */}
              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  setShowScoreHistory(true);
                }}
                className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/70 hover:bg-slate-800 border border-slate-800 text-left transition cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <BarChart3 className="w-5 h-5 text-emerald-400" />
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-white">
                      Sổ nợ & Lịch sử các ván
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {tableState.completedRounds?.length
                        ? `Đã đấu ${tableState.completedRounds.length} ván`
                        : 'Chưa có ván đấu nào'}
                    </div>
                  </div>
                </div>
                <span className="text-slate-400 text-xs font-bold">›</span>
              </button>

              {/* Nút Xem Lịch sử đánh bài ván hiện tại */}
              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  setShowPlayHistoryModal(true);
                }}
                className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/70 hover:bg-slate-800 border border-slate-800 text-left transition cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <History className="w-5 h-5 text-sky-400" />
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-white">
                      Lịch sử đánh bài ván này
                    </div>
                    <div className="text-[10px] text-slate-400">Xem lại từng nước đi</div>
                  </div>
                </div>
                <span className="text-slate-400 text-xs font-bold">›</span>
              </button>

              {/* Nút Xem Tổng kết ván vừa xong (nếu có) */}
              {tableState.roundResult && (
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsModal(false);
                    setShowRoundOverModal(true);
                  }}
                  className="flex items-center justify-between p-3 rounded-2xl bg-amber-950/30 hover:bg-amber-950/50 border border-amber-500/30 text-left transition cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-amber-200">
                        Bảng tổng kết ván vừa rồi
                      </div>
                      <div className="text-[10px] text-amber-400/80">Xem chi tiết điểm phạt</div>
                    </div>
                  </div>
                  <span className="text-amber-400 text-xs font-bold">›</span>
                </button>
              )}

              {/* Nút Debug Bot AI (Host) */}
              {isHost && (
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsModal(false);
                    setShowDebugModal(true);
                  }}
                  className="flex items-center justify-between p-3 rounded-2xl bg-indigo-950/50 hover:bg-indigo-900/60 border border-indigo-500/40 text-left transition cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">🐞</span>
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-indigo-200">
                        Debug Bot AI (Chủ phòng)
                      </div>
                      <div className="text-[10px] text-indigo-400/80">Nhật ký ra quyết định của bot</div>
                    </div>
                  </div>
                  <span className="text-indigo-400 text-xs font-bold">›</span>
                </button>
              )}
            </div>
          </div>
        </div>
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
          isPaused={isPaused}
          records={tableState.roundPlayRecords || []}
          onClose={() => setShowPlayHistoryModal(false)}
        />
      )}

      {/* MODAL XÁC NHẬN KHI BẤM "TRỞ VỀ" */}
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
