'use client';

import React, { useState } from 'react';
import { LocSession, LocPlayer, getShortNameMap } from '@/lib/loc-core';
import { Plus, Users, Clock, Sparkles, ChevronRight, X, UserPlus, ArrowLeft, Gamepad2 } from 'lucide-react';
import Link from 'next/link';

interface LocLobbyProps {
  sessions: LocSession[];
  availableClubPlayers: { id: string; name: string }[];
  onSelectSession: (sessionId: string) => void;
  onCreateSession: (title: string, players: LocPlayer[]) => Promise<void>;
}

export function LocLobby({
  sessions,
  availableClubPlayers,
  onSelectSession,
  onCreateSession,
}: LocLobbyProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState<LocPlayer[]>([]);
  const [guestName, setGuestName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleClubPlayer = (p: { id: string; name: string }) => {
    if (selectedPlayers.some(sp => sp.id === p.id)) {
      setSelectedPlayers(prev => prev.filter(sp => sp.id !== p.id));
    } else {
      setSelectedPlayers(prev => [...prev, { id: p.id, name: p.name }]);
    }
  };

  const handleAddGuest = () => {
    const trimmed = guestName.trim();
    if (!trimmed) return;
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
    setSelectedPlayers(prev => [...prev, { id: guestId, name: trimmed }]);
    setGuestName('');
  };

  const handleRemovePlayer = (id: string) => {
    setSelectedPlayers(prev => prev.filter(sp => sp.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPlayers.length < 2) {
      setError('Cần ít nhất 2 người chơi (khuyên dùng 3 - 5 người)');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onCreateSession(title, selectedPlayers);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi khi tạo buổi chơi');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Top Bar */}
      <div className="bg-slate-950/90 border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            href="/analysis"
            className="p-1.5 -ml-1 text-white/60 hover:text-white rounded-lg hover:bg-white/10"
            title="Quay lại phân tích"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xl">🂠</span>
            <div>
              <h1 className="text-base font-black text-white">Sổ Lốc Tính Lá</h1>
              <p className="text-[10px] text-white/50">Đếm lá & Bù trừ công nợ</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/danhloc"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-black text-xs uppercase tracking-wider transition-all shadow-md active:scale-95"
            title="Đánh bài Sâm Lốc Online thời gian thực"
          >
            <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Chơi Online</span>
            <span className="sm:hidden">Online</span>
          </Link>
          <button
            onClick={() => {
              setIsCreating(true);
              setTitle(`Buổi chơi ${new Date().toLocaleDateString('vi-VN')}`);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-500/20 active:scale-95"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>Tạo mới</span>
          </button>
        </div>
      </div>

      <div className="flex-1 max-w-lg w-full mx-auto p-4 space-y-4">
        {/* Form Tạo buổi chơi mới nếu bật */}
        {isCreating && (
          <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/30 shadow-2xl space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Thiết lập buổi chơi</h3>
              </div>
              <button
                onClick={() => setIsCreating(false)}
                className="p-1 text-white/40 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-white/60 mb-1">
                Tên buổi chơi
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="VD: Lốc chiều CN"
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Danh sách đã chọn */}
            <div>
              <label className="block text-xs font-semibold text-white/60 mb-1.5">
                Người tham gia ({selectedPlayers.length} người)
              </label>
              {selectedPlayers.length === 0 ? (
                <p className="text-xs text-white/40 italic p-2 rounded-lg bg-white/[0.02]">
                  Chạm vào tên bên dưới để chọn thành viên
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {selectedPlayers.map(p => (
                    <div
                      key={p.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold"
                    >
                      <span>{p.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemovePlayer(p.id)}
                        className="text-emerald-400 hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Chọn nhanh từ danh sách thành viên */}
            {availableClubPlayers.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-white/50 mb-1.5">
                  Chọn nhanh từ thành viên:
                </label>
                <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto p-1 bg-black/20 rounded-xl border border-white/5">
                  {availableClubPlayers.map(cp => {
                    const isSelected = selectedPlayers.some(sp => sp.id === cp.id);
                    return (
                      <button
                        key={cp.id}
                        type="button"
                        onClick={() => toggleClubPlayer(cp)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                          isSelected
                            ? 'bg-emerald-500 text-black font-bold'
                            : 'bg-white/5 hover:bg-white/10 text-white/70'
                        }`}
                      >
                        {cp.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Thêm người ngoài */}
            <div>
              <label className="block text-xs font-semibold text-white/50 mb-1">
                Hoặc thêm người ngoài:
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddGuest();
                    }
                  }}
                  placeholder="Nhập tên người ngoài..."
                  className="flex-1 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={handleAddGuest}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Thêm</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || selectedPlayers.length < 2}
              className={`w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                isSubmitting || selectedPlayers.length < 2
                  ? 'bg-white/10 text-white/30 cursor-not-allowed'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 active:scale-[0.99]'
              }`}
            >
              {isSubmitting ? 'Đang khởi tạo...' : 'Bắt đầu buổi chơi'}
            </button>
          </div>
        )}

        {/* Danh sách các buổi chơi gần đây */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-white/60 uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5" />
            <span>Các buổi chơi gần đây ({sessions.length})</span>
          </div>

          {sessions.length === 0 ? (
            <div className="py-12 text-center text-xs text-white/40 italic rounded-2xl bg-slate-900 border border-white/5">
              Chưa có buổi chơi nào. Hãy bấm &quot;Tạo mới&quot; để bắt đầu!
            </div>
          ) : (
            sessions.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectSession(s.id)}
                className="w-full p-4 rounded-2xl bg-slate-900 border border-white/10 hover:border-amber-500/40 text-left transition-all active:scale-[0.99] flex items-center justify-between group"
              >
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-white group-hover:text-amber-400 transition-colors">
                    {s.title}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-white/50">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {Array.from(getShortNameMap(s.players).values()).join(', ')}
                    </span>
                  </div>
                  <div className="text-[10px] text-white/30 font-mono">
                    {new Date(s.updatedAt).toLocaleDateString('vi-VN')} · {new Date(s.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                <div className="w-8 h-8 rounded-full bg-white/5 group-hover:bg-amber-500/20 text-white/40 group-hover:text-amber-400 flex items-center justify-center transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
