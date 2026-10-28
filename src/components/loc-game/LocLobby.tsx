'use client';

import React, { useState, useEffect } from 'react';
import { RoomSummary } from '@/lib/loc-game/network-types';
import { subscribeLobby } from '@/lib/loc-game/network';
import { Users, Plus, Eye, Play, Bot } from 'lucide-react';

interface LocLobbyProps {
  playerName: string;
  onUpdatePlayerName: (name: string) => void;
  onCreateRoom: (roomName: string) => void;
  onJoinRoom: (roomId: string, isSpectator: boolean) => void;
  onPlayWithBots?: () => void;
}

export const LocLobby: React.FC<LocLobbyProps> = ({
  playerName,
  onUpdatePlayerName,
  onCreateRoom,
  onJoinRoom,
  onPlayWithBots,
}) => {
  const [rooms, setRooms] = useState<Record<string, RoomSummary>>({});
  const [newRoomName, setNewRoomName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Lắng nghe phát sóng danh sách phòng từ Lobby Channel & HTTP sync
  useEffect(() => {
    // 1. Fetch danh sách phòng từ API ngay khi vừa mở trang
    const fetchRooms = async () => {
      try {
        const res = await fetch('/api/danhloc/rooms');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.rooms)) {
            setRooms((prev) => {
              const updated = { ...prev };
              data.rooms.forEach((r: RoomSummary) => {
                updated[r.id] = r;
              });
              return updated;
            });
          }
        }
      } catch {
        // ignore
      }
    };

    fetchRooms();
    const pollInterval = setInterval(fetchRooms, 2500);

    // 2. Lắng nghe broadcast trực tiếp qua kênh loc_lobby
    const sub = subscribeLobby((event) => {
      if (event.type === 'LOBBY_ANNOUNCE') {
        setRooms((prev) => ({
          ...prev,
          [event.room.id]: event.room,
        }));
      } else if (event.type === 'LOBBY_CLOSE') {
        setRooms((prev) => {
          const next = { ...prev };
          delete next[event.roomId];
          return next;
        });
      }
    });

    // 3. Tự động dọn dẹp các phòng không có heartbeat sau 8 giây
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setRooms((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [id, r] of Object.entries(next)) {
          if (now - r.updatedAt > 8000) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 4000);

    return () => {
      clearInterval(pollInterval);
      sub.unsubscribe();
      clearInterval(cleanupInterval);
    };
  }, []);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalPlayerName = playerName.trim() || 'Người chơi 1';
    if (!playerName.trim()) {
      onUpdatePlayerName(finalPlayerName);
    }
    const finalRoomName = newRoomName.trim() || `Phòng của ${finalPlayerName}`;
    onCreateRoom(finalRoomName);
    setShowCreateModal(false);
    setNewRoomName('');
  };

  const roomList = Object.values(rooms);

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 flex flex-col items-center p-4">
      {/* Container chính */}
      <div className="w-full max-w-2xl flex flex-col gap-5 my-auto py-6">
        {/* Tiêu đề */}
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 bg-clip-text text-transparent">
            GAME ĐÁNH LỐC
          </h1>
          <p className="text-xs md:text-sm text-slate-400">
            Đồng bộ Realtime • Tối đa 5 người • Tính điểm quy ra lá
          </p>
        </div>

        {/* Khung nhập tên người chơi */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-md flex flex-col sm:flex-row items-center gap-3">
          <div className="flex-1 w-full">
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Tên người chơi của bạn:
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => onUpdatePlayerName(e.target.value)}
              placeholder="Nhập tên hiển thị..."
              maxLength={20}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            />
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto mt-2 sm:mt-5">
            {onPlayWithBots && (
              <button
                type="button"
                onClick={onPlayWithBots}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Bot className="w-4 h-4" />
                Chơi với Bot
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-lg hover:brightness-110 active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Tạo phòng mới
            </button>
          </div>
        </div>

        {/* Danh sách phòng công khai */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-amber-400" />
              Phòng đang mở ({roomList.length})
            </span>
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Tự động cập nhật trực tiếp
            </span>
          </div>

          {roomList.length === 0 ? (
            <div className="py-12 px-4 rounded-2xl bg-slate-900/40 border border-dashed border-slate-800 text-center flex flex-col items-center">
              <Users className="w-8 h-8 text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-400">
                Chưa có phòng nào đang mở.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Hãy là người đầu tiên bấm &ldquo;Tạo phòng mới&rdquo; ở trên!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {roomList.map((room) => {
                const isFull = room.playerCount >= 5;
                const isPlaying = room.status !== 'waiting';

                return (
                  <div
                    key={room.id}
                    className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition shadow-lg flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-slate-100">
                          {room.name}
                        </span>
                        {isPlaying ? (
                          <span className="text-[10px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-800/80 px-2 py-0.5 rounded-full">
                            Đang chơi
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 px-2 py-0.5 rounded-full">
                            Đang chờ ({room.playerCount}/5)
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">
                        Chủ phòng: <strong className="text-slate-300">{room.hostName}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Nút Vào chơi */}
                      {!isFull && !isPlaying && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!playerName.trim()) {
                              const autoName = `Người chơi ${Math.floor(Math.random() * 90 + 10)}`;
                              onUpdatePlayerName(autoName);
                            }
                            onJoinRoom(room.id, false);
                          }}
                          className="px-4 py-2 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow active:scale-95 transition flex items-center gap-1 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          Vào chơi
                        </button>
                      )}

                      {/* Nút Xem (Spectator) */}
                      <button
                        type="button"
                        onClick={() => onJoinRoom(room.id, true)}
                        className="px-3 py-2 rounded-xl font-medium text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 active:scale-95 transition flex items-center gap-1"
                        title="Vào xem bàn đấu"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Xem
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* MODAL TẠO PHÒNG MỚI */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-3">Tạo phòng đánh Lốc</h3>
            <form onSubmit={handleCreateSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tên phòng:</label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder={`Phòng của ${playerName || 'bạn'}`}
                  autoFocus
                  maxLength={30}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 active:scale-95 transition cursor-pointer"
                >
                  Tạo phòng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
