'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Loader2,
  Lock,
  ShieldCheck,
  Trash2,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import {
  addPlayerAction,
  createSeasonAction,
  deletePlayerAction,
  deleteSeasonAction,
  endSeasonAction,
  setActiveSeasonAction,
  updateFineAction,
  updatePlayerAction,
} from '@/app/actions';
import { cn } from '@/lib/utils';
import { GUEST_NAME, isGuestId } from '@/lib/guest';

type Player = { id: string; name: string; active?: boolean; deleted_at?: unknown };
type Season = { id: string; name: string; active?: boolean; start_date?: string };
type ActionResult = { error?: string; success?: boolean };
type Feedback = { target: string; type: 'saving' | 'success' | 'error'; text: string } | null;

type Props = {
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
  onUnlock: (password: string) => boolean;
  onLock: () => void;
  players: Player[];
  seasons: Season[];
  config: Record<string, string>;
};

const tabs = [
  { id: 'access', label: 'Quyền', Icon: Lock },
  { id: 'players', label: 'Thành viên', Icon: Users },
  { id: 'seasons', label: 'Season', Icon: Trophy },
  { id: 'money', label: 'Tiền phạt', Icon: Banknote },
] as const;

function InlineFeedback({ feedback, target }: { feedback: Feedback; target: string }) {
  if (!feedback || feedback.target !== target) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-black',
        feedback.type === 'error' ? 'text-red-400' : 'text-primary',
      )}
    >
      {feedback.type === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
      {feedback.text}
    </span>
  );
}

function actionError(res: { success?: boolean } | { error?: string } | undefined) {
  return res && 'error' in res ? res.error : undefined;
}

export function SettingsModal({ open, onClose, canEdit, onUnlock, onLock, players, seasons, config }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>(canEdit ? 'players' : 'access');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [deleteTarget, setDeleteTarget] = useState<Player | null>(null);
  const [deleteSeasonTarget, setDeleteSeasonTarget] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  // Reset tab when modal opens
  useEffect(() => {
    if (!open) return;

    const resetId = window.setTimeout(() => {
      setTab(canEdit ? 'players' : 'access');
      setFeedback(null);
    }, 0);

    return () => window.clearTimeout(resetId);
  }, [open, canEdit]);

  if (!open) return null;

  const submit = (action: (fd: FormData) => Promise<ActionResult>, formData: FormData, target: string, successText = 'Đã lưu') => {
    setFeedback({ target, type: 'saving', text: 'Đang lưu...' });
    start(async () => {
      const res = await action(formData);
      const error = actionError(res);
      if (error) {
        setFeedback({ target, type: 'error', text: error });
        return;
      }

      setFeedback({ target, type: 'success', text: successText });
      router.refresh();
    });
  };

  const visibleTabs = canEdit 
    ? [...tabs.filter(t => t.id !== 'access'), tabs.find(t => t.id === 'access')!]
    : tabs.filter(t => t.id === 'access');
  const activeTab = tab;

  return (
    <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />
      <div 
        className="relative w-full sm:max-w-4xl h-[92vh] sm:h-[640px] sm:rounded-3xl rounded-t-[2.5rem] border border-slate-500/25 bg-[#142034] shadow-[0_28px_90px_rgba(0,0,0,0.42)] overflow-hidden flex flex-col animate-in slide-in-from-bottom-10 duration-300"
      >
        <div className="flex items-center justify-between px-6 py-3.5 sm:py-5 border-b border-slate-500/25 shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">Cài đặt</h2>
            <p className="text-[9px] sm:text-[10px] font-bold text-slate-300/70 uppercase tracking-widest mt-0.5">
              {canEdit ? 'Đang có quyền chỉnh sửa' : 'Nhập mật khẩu để mở khóa'}
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] flex items-center justify-center text-slate-300/80 transition-all active:scale-90">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col sm:grid sm:grid-cols-[220px_1fr]">
          {/* Menu - Grid on Mobile, Sidebar on Desktop */}
          <div className="shrink-0 p-2 sm:p-4 border-b border-slate-500/25 bg-white/[0.035] sm:bg-white/[0.05]">
            <div className="grid grid-cols-2 sm:flex sm:flex-col gap-1 sm:gap-2">
              {visibleTabs.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={cn(
                    'flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-4 rounded-xl sm:rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] transition-all',
                    activeTab === id 
                      ? 'bg-primary text-black shadow-lg shadow-primary/20 sm:scale-105' 
                      : 'text-slate-300/70 hover:text-white hover:bg-white/[0.08]',
                  )}
                >
                  <Icon className={cn("w-3.5 h-3.5 sm:w-4 h-4", activeTab === id ? "opacity-100" : "opacity-40")} />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-10 space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            {activeTab === 'access' && (
              <div className="rounded-2xl border border-slate-500/25 bg-white/[0.055] p-6">
                <div className="flex items-center gap-4 mb-5">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center border",
                    canEdit ? "bg-primary/10 border-primary/20 text-primary" : "bg-white/[0.07] border-slate-400/20 text-slate-300/65"
                  )}>
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-black text-white text-lg tracking-tight">{canEdit ? 'Quyền chỉnh sửa đang mở' : 'Mở quyền chỉnh sửa'}</div>
                    <p className="text-xs font-bold text-slate-300/65 uppercase tracking-widest">Xác thực để thay đổi dữ liệu</p>
                  </div>
                </div>

                {!canEdit ? (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Nhập mật khẩu..."
                      className="flex-1 rounded-2xl bg-[#0f1a2c] border border-slate-500/25 px-5 py-4 text-white outline-none focus:border-primary/60 focus:bg-[#111f34] transition-all"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const ok = onUnlock(password);
                          if (ok) {
                            setPassword('');
                            onClose();
                          } else {
                            setFeedback({ target: 'access', type: 'error', text: 'Sai pass' });
                          }
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        const ok = onUnlock(password);
                        if (ok) {
                          setPassword('');
                          onClose();
                        } else {
                          setFeedback({ target: 'access', type: 'error', text: 'Sai pass' });
                        }
                      }}
                      className="rounded-2xl bg-primary px-8 py-4 text-xs font-black text-black uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all"
                    >
                      Mở khóa
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => {
                        onLock();
                        setFeedback({ target: 'access', type: 'success', text: 'Đã khóa quyền chỉnh sửa' });
                      }}
                      className="rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] px-8 py-4 text-xs font-black text-slate-200/85 uppercase tracking-widest transition-all active:scale-95"
                    >
                      Khóa lại
                    </button>
                  </div>
                )}
                <div className="mt-3">
                  <InlineFeedback feedback={feedback} target="access" />
                </div>
              </div>
            )}

            {canEdit && activeTab === 'players' && (
              <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-[10px] font-black text-slate-300/65 uppercase tracking-[0.2em] px-1">Thêm thành viên</div>
                    <form action={(fd) => submit(addPlayerAction, fd, 'add-player', 'Đã thêm')} className="flex gap-2">
                      <input name="name" placeholder="Tên thành viên..." className="flex-1 rounded-xl bg-[#0f1a2c] border border-slate-500/25 px-4 py-2.5 text-sm text-white outline-none focus:border-primary/50 transition-all" />
                      <button disabled={isPending} className="rounded-xl bg-primary px-5 py-2.5 text-[10px] font-black text-black uppercase tracking-widest active:scale-95 transition-all">Thêm</button>
                    </form>
                    <InlineFeedback feedback={feedback} target="add-player" />
                  </div>

                  <div className="space-y-2">
                    <div className="text-[10px] font-black text-slate-300/65 uppercase tracking-[0.2em] px-1">Danh sách thành viên</div>
                    <div className="grid grid-cols-1 gap-1">
                      {[...players].sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1)).map(p => (
                        <div key={p.id} className={cn(
                          "group flex items-center gap-2 rounded-xl border p-1.5 transition-all",
                          p.active !== false 
                            ? "bg-white/[0.045] border-slate-500/20 hover:bg-white/[0.07]"
                            : "bg-black/20 border-slate-500/12 opacity-55"
                        )}>
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            <input 
                              defaultValue={isGuestId(p.id) ? GUEST_NAME : p.name}
                              disabled={isGuestId(p.id)}
                              onBlur={(e) => {
                                if (!isGuestId(p.id) && e.target.value.trim() !== p.name) {
                                  const fd = new FormData();
                                  fd.append('id', p.id);
                                  fd.append('name', e.target.value.trim());
                                  fd.append('active', String(p.active !== false));
                                  submit(updatePlayerAction, fd, `player-${p.id}`, 'Đã lưu');
                                }
                              }}
                              className="flex-1 bg-transparent px-2 py-0.5 text-sm font-bold text-white outline-none focus:text-primary transition-colors min-w-0 disabled:text-primary disabled:cursor-not-allowed" 
                            />
                            <InlineFeedback feedback={feedback} target={`player-${p.id}`} />
                          </div>
                          
                          <label className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-white/[0.08] rounded-lg transition-colors shrink-0">
                            <input 
                              type="checkbox" 
                              defaultChecked={p.active !== false} 
                              onChange={(e) => {
                                const fd = new FormData();
                                fd.append('id', p.id);
                                fd.append('name', p.name);
                                fd.append('active', String(e.target.checked));
                                submit(updatePlayerAction, fd, `player-${p.id}`, 'Đã lưu');
                              }}
                              className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-primary focus:ring-0 focus:ring-offset-0" 
                            />
                            <span className="text-[9px] font-black text-slate-300/65 uppercase tracking-widest hidden sm:inline">{isGuestId(p.id) ? 'Dropdown' : 'Active'}</span>
                          </label>

                          {!isGuestId(p.id) && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(p)}
                              className="w-7 h-7 rounded-lg border border-red-500/10 bg-red-500/5 text-red-400/20 hover:text-red-400 hover:bg-red-500/15 flex items-center justify-center transition-all shrink-0"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
            )}

            {canEdit && activeTab === 'seasons' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="text-[10px] font-black text-slate-300/70 uppercase tracking-[0.2em] px-1">Tạo Season mới</div>
                    <form action={(fd) => submit(createSeasonAction, fd, 'create-season', 'Đã tạo')} className="flex gap-2">
                      <input name="name" placeholder="Tên Season..." className="flex-1 rounded-2xl bg-[#0f1a2c] border border-slate-500/25 px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-all" />
                      <button disabled={isPending} className="rounded-2xl bg-primary px-4 py-3 text-[10px] font-black text-black uppercase tracking-widest shadow-lg shadow-primary/10 active:scale-95 transition-all">Tạo</button>
                    </form>
                    <InlineFeedback feedback={feedback} target="create-season" />
                  </div>

                  <div className="space-y-3">
                    <div className="text-[10px] font-black text-slate-300/70 uppercase tracking-[0.2em] px-1">Kết thúc nhanh</div>
                    <button 
                      onClick={() => submit(endSeasonAction, new FormData(), 'end-season', 'Đã bắt đầu Season mới')}
                      disabled={isPending}
                      className="w-full rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] border border-slate-500/25 px-5 py-3 text-[10px] font-black text-white/60 hover:text-white uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Trophy className="w-4 h-4 text-primary" />
                      Kết thúc & Sang Season mới
                    </button>
                    <InlineFeedback feedback={feedback} target="end-season" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-[10px] font-black text-slate-300/65 uppercase tracking-[0.2em] px-1">Danh sách Season</div>
                  <div className="grid grid-cols-1 gap-2">
                    {seasons.map(s => (
                      <div key={s.id || s.name} className={cn(
                        "group flex items-center justify-between gap-4 rounded-2xl border p-3 transition-all",
                        s.active 
                          ? "bg-primary/5 border-primary/20" 
                          : "bg-white/[0.045] border-slate-500/20 hover:bg-white/[0.07]"
                      )}>
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-black text-white text-base tracking-tight truncate">{s.name}</span>
                          {s.active && <span className="px-2 py-0.5 rounded-full bg-primary text-[8px] font-black text-black uppercase tracking-widest">Active</span>}
                          <InlineFeedback feedback={feedback} target={`season-${s.name}`} />
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {!s.active && (
                            <form action={(fd) => submit(setActiveSeasonAction, fd, `season-${s.name}`, 'Đã kích hoạt')}>
                              <input type="hidden" name="name" value={s.name} />
                              <button disabled={isPending} className="rounded-lg bg-white/[0.07] hover:bg-white/[0.12] px-3 py-1.5 text-[9px] font-black text-slate-300/80 hover:text-white uppercase tracking-widest transition-all">
                                Kích hoạt
                              </button>
                            </form>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteSeasonTarget(s.name)}
                            className="w-8 h-8 rounded-lg border border-red-500/10 bg-red-500/5 text-red-400/20 hover:text-red-400 hover:bg-red-500/15 flex items-center justify-center transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {canEdit && activeTab === 'money' && (
              <div className="space-y-4">
                <div className="text-[10px] font-black text-slate-300/70 uppercase tracking-[0.2em] px-1">Cấu hình tài chính</div>
                <form action={(fd) => submit(updateFineAction, fd, 'fine', 'Đã lưu')} className="space-y-5 rounded-2xl border border-slate-500/25 bg-white/[0.055] p-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-300/75 uppercase tracking-widest">Mức phạt mỗi lượt thua</label>
                    <div className="relative">
                      <input name="lose_money" type="number" defaultValue={config.lose_money || '5000'} className="w-full rounded-2xl bg-[#0f1a2c] border border-slate-500/25 px-5 py-4 text-white font-black text-xl outline-none focus:border-primary/50 transition-all pl-12" />
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300/65 font-black text-lg">₫</div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <InlineFeedback feedback={feedback} target="fine" />
                    <button disabled={isPending} className="rounded-2xl bg-primary px-10 py-4 text-xs font-black text-black uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all">Lưu cấu hình</button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Delete Player Modal */}
        {deleteTarget && (
          <div className="absolute inset-0 z-[600] flex items-center justify-center bg-black/70 backdrop-blur-md p-6">
            <div className="w-full max-w-sm rounded-[2.5rem] border border-red-500/20 bg-[#142034] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                   <AlertTriangle className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white tracking-tight">Xóa thành viên & Trận?</h3>
                  <p className="mt-2 text-sm font-bold text-slate-300/70 leading-relaxed">
                    Hành động này sẽ xóa **{deleteTarget.name}** và **toàn bộ lịch sử trận** liên quan. Dữ liệu sẽ được lưu vào kho lưu trữ (Archive).
                  </p>
                </div>
                <div className="flex gap-3 w-full">
                  <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] px-4 py-4 text-xs font-black text-slate-300/75 uppercase tracking-widest transition-all">Hủy</button>
                  <button
                    onClick={() => {
                      const fd = new FormData();
                      fd.append('id', deleteTarget.id);
                      setFeedback({ target: 'delete-player', type: 'saving', text: 'Đang xóa...' });
                      start(async () => {
                        const res = await deletePlayerAction(fd);
                        const error = actionError(res);
                        if (error) {
                          setFeedback({ target: 'delete-player', type: 'error', text: error });
                          return;
                        }
                        setFeedback({ target: 'delete-player', type: 'success', text: 'Đã xóa' });
                        setDeleteTarget(null);
                        router.refresh();
                      });
                    }}
                    className="flex-1 rounded-2xl bg-red-500 hover:bg-red-600 px-4 py-4 text-xs font-black text-white uppercase tracking-widest shadow-lg shadow-red-500/20 active:scale-95 transition-all"
                  >
                    Xóa sạch
                  </button>
                </div>
                <InlineFeedback feedback={feedback} target="delete-player" />
              </div>
            </div>
          </div>
        )}

        {/* Delete Season Modal */}
        {deleteSeasonTarget && (
          <div className="absolute inset-0 z-[600] flex items-center justify-center bg-black/70 backdrop-blur-md p-6">
            <div className="w-full max-w-sm rounded-[2.5rem] border border-red-500/20 bg-[#142034] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                   <AlertTriangle className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white tracking-tight">Xóa Season & Trận?</h3>
                  <p className="mt-2 text-sm font-bold text-slate-300/70 leading-relaxed">
                    Xóa **{deleteSeasonTarget}** và toàn bộ trận đấu trong season này. Dữ liệu sẽ được backup vào Archive.
                  </p>
                </div>
                <div className="flex gap-3 w-full">
                  <button onClick={() => setDeleteSeasonTarget(null)} className="flex-1 rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] px-4 py-4 text-xs font-black text-slate-300/75 uppercase tracking-widest transition-all">Hủy</button>
                  <button
                    onClick={() => {
                      const fd = new FormData();
                      fd.append('name', deleteSeasonTarget);
                      setFeedback({ target: 'delete-season', type: 'saving', text: 'Đang xóa...' });
                      start(async () => {
                        const res = await deleteSeasonAction(fd);
                        const error = actionError(res);
                        if (error) {
                          setFeedback({ target: 'delete-season', type: 'error', text: error });
                          return;
                        }
                        setFeedback({ target: 'delete-season', type: 'success', text: 'Đã xóa' });
                        setDeleteSeasonTarget(null);
                        router.refresh();
                      });
                    }}
                    className="flex-1 rounded-2xl bg-red-500 hover:bg-red-600 px-4 py-4 text-xs font-black text-white uppercase tracking-widest shadow-lg shadow-red-500/20 active:scale-95 transition-all"
                  >
                    Xóa sạch
                  </button>
                </div>
                <InlineFeedback feedback={feedback} target="delete-season" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
