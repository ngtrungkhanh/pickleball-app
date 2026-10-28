'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LocLobby } from '@/components/loc-game/LocLobby';
import { LocGameBoard } from '@/components/loc-game/LocGameBoard';
import { TableState, BroadcastEvent } from '@/lib/loc-game/network-types';
import { Card } from '@/lib/loc-game/types';
import { subscribeRoom, subscribeLobby, HostGameEngine } from '@/lib/loc-game/network';

function getInitialPlayerId(): string {
  if (typeof window !== 'undefined') {
    // Dùng sessionStorage để mỗi tab trình duyệt là một người chơi độc lập
    let pid = sessionStorage.getItem('loc_player_id');
    if (!pid) {
      pid = 'p_' + Math.random().toString(36).substring(2, 9);
      sessionStorage.setItem('loc_player_id', pid);
    }
    return pid;
  }
  return '';
}

function getInitialPlayerName(): string {
  if (typeof window !== 'undefined') {
    // Đọc từ sessionStorage trước, nếu chưa có thì lấy từ localStorage (để không phải gõ lại)
    const sessionName = sessionStorage.getItem('loc_player_name');
    if (sessionName) return sessionName;
    return localStorage.getItem('loc_player_name') || '';
  }
  return '';
}

function generateRoomId(): string {
  return 'loc_' + Math.random().toString(36).substring(2, 8);
}

function generateOfflineRoomId(): string {
  return 'offline_' + Math.random().toString(36).substring(2, 8);
}

export default function DanhLocPage() {
  const [playerName, setPlayerName] = useState<string>(getInitialPlayerName);
  const [playerId] = useState<string>(getInitialPlayerId);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [isSpectator, setIsSpectator] = useState<boolean>(false);

  const [tableState, setTableState] = useState<TableState | null>(null);
  const [myHand, setMyHand] = useState<Card[]>([]);

  // State xác nhận đổi máy (Takeover) khi trùng tên
  const [confirmTakeoverName, setConfirmTakeoverName] = useState<string | null>(null);
  // State thông báo bị ngắt kết nối do đổi thiết bị khác
  const [kickedReason, setKickedReason] = useState<string | null>(null);

  // Ref lưu giữ HostEngine nếu máy này là Host
  const hostEngineRef = useRef<HostGameEngine | null>(null);
  // Ref hàm gửi broadcast trong room
  const sendRoomEventRef = useRef<((event: BroadcastEvent) => void) | null>(null);

  const handleUpdatePlayerName = (name: string) => {
    setPlayerName(name);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('loc_player_name', name);
      localStorage.setItem('loc_player_name', name);
    }
  };

  // 1. TẠO PHÒNG MỚI (Máy này làm Host)
  const handleCreateRoom = (roomName: string) => {
    const roomId = generateRoomId();
    setIsSpectator(false);
    setCurrentRoomId(roomId);

    // Kết nối kênh của phòng
    const sub = subscribeRoom(roomId, (event) => {
      handleIncomingRoomEvent(event);
    });
    sendRoomEventRef.current = sub.send;

    // Kênh gửi tin nhắn ra Lobby
    const lobbySub = subscribeLobby(() => {});

    // Kênh phát sóng của Host: vừa dispatch nội bộ cho chính Host để cập nhật UI, vừa gửi qua mạng
    const hostBroadcast = (event: BroadcastEvent) => {
      handleIncomingRoomEvent(event);
      sub.send(event);
    };

    // Khởi tạo HostGameEngine
    const engine = new HostGameEngine(
      roomId,
      roomName,
      playerId,
      playerName.trim() || 'Chủ phòng',
      hostBroadcast,
      lobbySub.send
    );
    hostEngineRef.current = engine;
    engine.startLobbyAnnounce();

    // Cập nhật state ban đầu
    setTableState(engine.getState());
    setMyHand(engine.getPlayerHand(playerId));
  };

  // 2. VÀO PHÒNG CÓ SẴN (Client hoặc Spectator)
  const handleJoinRoom = (roomId: string, spectatorMode: boolean) => {
    setIsSpectator(spectatorMode);
    setCurrentRoomId(roomId);

    const sub = subscribeRoom(roomId, (event) => {
      handleIncomingRoomEvent(event);
    });
    sendRoomEventRef.current = sub.send;

    // Bắn tin xin vào phòng
    sub.send({
      type: 'JOIN_ROOM',
      roomId,
      player: {
        id: playerId,
        name: playerName.trim() || (spectatorMode ? 'Khán giả' : 'Người chơi'),
        isSpectator: spectatorMode,
      },
    });
  };

  // 3. RỜI PHÒNG
  const handleLeaveRoom = useCallback(() => {
    if (hostEngineRef.current) {
      if (currentRoomId && sendRoomEventRef.current) {
        sendRoomEventRef.current({
          type: 'ROOM_CLOSED',
          roomId: currentRoomId,
          reason: 'Chủ phòng đã rời phòng. Bàn chơi đã giải tán!',
        });
      }
      hostEngineRef.current.destroy();
      hostEngineRef.current = null;
    } else if (currentRoomId && sendRoomEventRef.current) {
      sendRoomEventRef.current({
        type: 'LEAVE_ROOM',
        roomId: currentRoomId,
        playerId,
      });
    }

    setCurrentRoomId(null);
    setTableState(null);
    setMyHand([]);
    setIsSpectator(false);
    setConfirmTakeoverName(null);
  }, [currentRoomId, playerId]);

  // 4. CHƠI VỚI BOT (SOLO OFFLINE 100% TRÊN MÁY KHÁCH)
  const handlePlayWithBots = () => {
    const roomId = generateOfflineRoomId();
    const finalPlayerName = playerName.trim() || 'Người chơi 1';
    if (!playerName.trim()) {
      handleUpdatePlayerName(finalPlayerName);
    }

    setIsSpectator(false);
    setCurrentRoomId(roomId);

    // Kênh ảo cục bộ (local dispatch trực tiếp)
    const engine = new HostGameEngine(
      roomId,
      'Luyện tập với Bot 🤖',
      playerId,
      finalPlayerName,
      (evt) => handleIncomingRoomEvent(evt)
    );

    // Tự động thêm 3 bot để tạo ván 4 người
    engine.addBot();
    engine.addBot();
    engine.addBot();

    hostEngineRef.current = engine;
    setTableState(engine.getState());
    setMyHand(engine.getPlayerHand(playerId));
  };

  // XỬ LÝ CÁC BẢN TIN ĐẾN
  const handleIncomingRoomEvent = (event: BroadcastEvent) => {
    // Nếu máy này là Host: Xử lý các yêu cầu từ Client
    if (hostEngineRef.current) {
      const engine = hostEngineRef.current;

      if (event.type === 'JOIN_ROOM') {
        engine.handleJoin(event.player, event.forceClaim);
      } else if (event.type === 'LEAVE_ROOM') {
        engine.handleLeave(event.playerId);
      } else if (event.type === 'ADD_BOT') {
        engine.addBot();
      } else if (event.type === 'REMOVE_BOT') {
        engine.removeBot(event.botId);
      } else if (event.type === 'CALL_SAM') {
        engine.handleCallSam(event.playerId);
      } else if (event.type === 'SKIP_SAM') {
        engine.handleSkipSam(event.playerId);
      } else if (event.type === 'PLAY_CARDS') {
        engine.handlePlayCards(event.playerId, event.cards);
      } else if (event.type === 'PASS_TURN') {
        engine.handlePassTurn(event.playerId);
      } else if (event.type === 'PLAYER_READY') {
        engine.handlePlayerReady(event.playerId, event.isReady);
      } else if (event.type === 'END_ROUND_WAITING') {
        engine.endRoundToWaiting();
      }
    }

    // Xử lý chung cho tất cả các máy (cả Host và Client)
    if (event.type === 'ROOM_CLOSED') {
      alert(event.reason || 'Phòng chơi đã đóng do chủ phòng rời phòng!');
      if (hostEngineRef.current) {
        hostEngineRef.current.destroy();
        hostEngineRef.current = null;
      }
      setCurrentRoomId(null);
      setTableState(null);
      setMyHand([]);
      setIsSpectator(false);
      setConfirmTakeoverName(null);
    } else if (event.type === 'NAME_EXISTS_CONFIRM' && event.targetPlayerId === playerId) {
      setConfirmTakeoverName(event.existingName);
    } else if (event.type === 'KICKED_TAKEOVER' && event.targetPlayerId === playerId) {
      setKickedReason(event.reason);
      if (hostEngineRef.current) {
        hostEngineRef.current.destroy();
        hostEngineRef.current = null;
      }
      setCurrentRoomId(null);
      setTableState(null);
      setMyHand([]);
    } else if (event.type === 'SYNC_TABLE_STATE') {
      setTableState(event.state);
      // Nếu là Host: tự đồng bộ bài của Host
      if (hostEngineRef.current) {
        setMyHand([...hostEngineRef.current.getPlayerHand(playerId)]);
      }
    } else if (event.type === 'SYNC_HAND' && event.targetPlayerId === playerId) {
      // Client nhận bài riêng từ Host
      setMyHand([...event.hand]);
    }
  };

  // Xác nhận đổi máy (Takeover) khi trùng tên
  const handleConfirmTakeover = () => {
    if (currentRoomId && sendRoomEventRef.current && confirmTakeoverName) {
      sendRoomEventRef.current({
        type: 'JOIN_ROOM',
        roomId: currentRoomId,
        player: {
          id: playerId,
          name: confirmTakeoverName,
          isSpectator: false,
        },
        forceClaim: true,
      });
      setConfirmTakeoverName(null);
    }
  };

  const handleCancelTakeover = () => {
    setConfirmTakeoverName(null);
    handleLeaveRoom();
  };

  // CÁC HÀNH ĐỘNG CỦA NGƯỜI CHƠI TRÊN BÀN
  const handlePlayCards = (cards: Card[]) => {
    if (hostEngineRef.current) {
      hostEngineRef.current.handlePlayCards(playerId, cards);
    } else if (sendRoomEventRef.current && currentRoomId) {
      sendRoomEventRef.current({
        type: 'PLAY_CARDS',
        roomId: currentRoomId,
        playerId,
        cards,
      });
    }
  };

  const handlePassTurn = () => {
    if (hostEngineRef.current) {
      hostEngineRef.current.handlePassTurn(playerId);
    } else if (sendRoomEventRef.current && currentRoomId) {
      sendRoomEventRef.current({
        type: 'PASS_TURN',
        roomId: currentRoomId,
        playerId,
      });
    }
  };

  const handleCallSam = () => {
    if (hostEngineRef.current) {
      hostEngineRef.current.handleCallSam(playerId);
    } else if (sendRoomEventRef.current && currentRoomId) {
      sendRoomEventRef.current({
        type: 'CALL_SAM',
        roomId: currentRoomId,
        playerId,
      });
    }
  };

  const handleSkipSam = () => {
    if (hostEngineRef.current) {
      hostEngineRef.current.handleSkipSam(playerId);
    } else if (sendRoomEventRef.current && currentRoomId) {
      sendRoomEventRef.current({
        type: 'SKIP_SAM',
        roomId: currentRoomId,
        playerId,
      });
    }
  };

  const handleAddBot = () => {
    if (hostEngineRef.current) {
      hostEngineRef.current.addBot();
    } else if (sendRoomEventRef.current && currentRoomId) {
      sendRoomEventRef.current({
        type: 'ADD_BOT',
        roomId: currentRoomId,
      });
    }
  };

  const handleRemoveBot = (botId: string) => {
    if (hostEngineRef.current) {
      hostEngineRef.current.removeBot(botId);
    } else if (sendRoomEventRef.current && currentRoomId) {
      sendRoomEventRef.current({
        type: 'REMOVE_BOT',
        roomId: currentRoomId,
        botId,
      });
    }
  };

  const handleStartGame = () => {
    if (hostEngineRef.current) {
      hostEngineRef.current.startGame();
      setTableState({ ...hostEngineRef.current.getState() });
      setMyHand([...hostEngineRef.current.getPlayerHand(playerId)]);
    }
  };

  const handleNextRound = () => {
    if (hostEngineRef.current) {
      hostEngineRef.current.startGame();
      setTableState({ ...hostEngineRef.current.getState() });
      setMyHand([...hostEngineRef.current.getPlayerHand(playerId)]);
    }
  };

  const handlePlayerReady = (isReady: boolean) => {
    if (hostEngineRef.current) {
      hostEngineRef.current.handlePlayerReady(playerId, isReady);
      setTableState({ ...hostEngineRef.current.getState() });
      setMyHand([...hostEngineRef.current.getPlayerHand(playerId)]);
    } else if (sendRoomEventRef.current && currentRoomId) {
      sendRoomEventRef.current({
        type: 'PLAYER_READY',
        roomId: currentRoomId,
        playerId,
        isReady,
      });
    }
  };

  const handleEndRoundToWaiting = () => {
    if (hostEngineRef.current) {
      hostEngineRef.current.endRoundToWaiting();
      setTableState({ ...hostEngineRef.current.getState() });
      setMyHand([]);
    } else if (sendRoomEventRef.current && currentRoomId) {
      sendRoomEventRef.current({
        type: 'END_ROUND_WAITING',
        roomId: currentRoomId,
      });
    }
  };

  // Cleanup khi unmount
  useEffect(() => {
    return () => {
      if (hostEngineRef.current) {
        hostEngineRef.current.destroy();
      }
    };
  }, []);

  return (
    <>
      {/* NẾU CHƯA VÀO PHÒNG -> HIỂN THỊ LOBBY */}
      {(!currentRoomId || !tableState) ? (
        <LocLobby
          playerName={playerName}
          onUpdatePlayerName={handleUpdatePlayerName}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onPlayWithBots={handlePlayWithBots}
        />
      ) : (
        /* NẾU ĐÃ VÀO PHÒNG -> HIỂN THỊ BÀN CHƠI */
        <LocGameBoard
          tableState={tableState}
          myPlayerId={playerId}
          myHand={myHand}
          isSpectator={isSpectator}
          onPlayCards={handlePlayCards}
          onPassTurn={handlePassTurn}
          onCallSam={handleCallSam}
          onSkipSam={handleSkipSam}
          onStartGame={handleStartGame}
          onLeaveRoom={handleLeaveRoom}
          onNextRound={handleNextRound}
          onPlayerReady={handlePlayerReady}
          onEndRoundToWaiting={handleEndRoundToWaiting}
          onAddBot={handleAddBot}
          onRemoveBot={handleRemoveBot}
        />
      )}

      {/* MODAL XÁC NHẬN ĐỔI MÁY (KHI NHẬP TRÙNG TÊN VÀO PHÒNG) */}
      {confirmTakeoverName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-5 shadow-2xl flex flex-col gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-2xl">
              🔄
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">
                Trùng tên người chơi
              </h3>
              <p className="text-sm text-slate-300">
                Phòng này đang có người chơi mang tên{' '}
                <span className="font-bold text-amber-400">&ldquo;{confirmTakeoverName}&rdquo;</span>.
              </p>
              <p className="text-xs text-slate-400 mt-2">
                Bạn có phải là <span className="text-white font-semibold">{confirmTakeoverName}</span> đang muốn chuyển sang chơi tiếp trên thiết bị này không?
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancelTakeover}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                Không phải
              </button>
              <button
                type="button"
                onClick={handleConfirmTakeover}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 hover:brightness-110 active:scale-95 transition shadow-lg cursor-pointer"
              >
                Đúng, là tôi!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL THÔNG BÁO BỊ ĐÁ KHI ĐĂNG NHẬP THIẾT BỊ KHÁC */}
      {kickedReason && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl max-w-sm w-full p-5 shadow-2xl flex flex-col gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto text-2xl">
              ⚠️
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">
                Ngắt kết nối
              </h3>
              <p className="text-sm text-slate-300">
                {kickedReason}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setKickedReason(null)}
              className="w-full py-2.5 rounded-xl text-sm font-bold bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer"
            >
              Về Sảnh chờ
            </button>
          </div>
        </div>
      )}
    </>
  );
}
